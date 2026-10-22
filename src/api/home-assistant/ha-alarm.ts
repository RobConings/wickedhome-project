import {
  ALARM_STATE_EVENT,
  toAlarmState,
  type AlarmActionKind,
  type AlarmActionResponse,
  type AlarmActionResultKind,
  type AlarmHistoryEntry,
  type AlarmLogEntry,
  type AlarmOverview,
  type AlarmPanel,
  type AlarmStateEvent,
} from "@/features/home-assistant/types/home-assistant";
import type { AuditAction, AuditChannel } from "@/features/audit/types/audit";
import { audit as recordAudit } from "../audit/audit.service";
import { db, type AlarmAction as AlarmActionRow, type AlarmActionResult as AlarmResultRow } from "../lib/db";
import { publish } from "../lib/events";
import { HttpError } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { AlarmRefusedError, assertAlarmActionAllowed, scrubCode, type AlarmActor } from "./alarm-guard";
import { HaCommandError, HaNotConnectedError, type HaState } from "./ha-client";
import { connectionStatusFor, getEntityState, getEntityStates, haHouseholdId, isHaHousehold, onEntityState, requireConnectedClient } from "./ha-connection";

/**
 * The alarm panel (Verisure via Home Assistant): state, history, arming and disarming.
 *
 * - Arming (home/away) needs `confirm: true` from the UI's confirmation dialog, and the code only when the
 *   panel asks for it (`code_arm_required`).
 * - Disarming needs the code, a signed-in owner or adult in the UI (alarm-guard.ts), and is rate-limited.
 *   The code goes to Home Assistant's `alarm_control_panel.alarm_disarm` and is never stored or logged.
 * - Every attempt (also refused and rate-limited ones) is written to `alarm_action_logs`.
 */

const SUPPORT_ARM_HOME = 1;
const SUPPORT_ARM_AWAY = 2;
const HISTORY_DAYS = 7;

/** Per person and per household, every disarm attempt counts (right or wrong code). */
const disarmPerUser = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
const disarmPerHousehold = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

const ACTION_ROW: Record<AlarmActionKind, AlarmActionRow> = { arm_home: "ARM_HOME", arm_away: "ARM_AWAY", disarm: "DISARM" };
const RESULT_ROW: Record<AlarmActionResultKind, AlarmResultRow> = {
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  refused: "REFUSED",
  rate_limited: "RATE_LIMITED",
};

const isPanel = (state: HaState) => state.entity_id.startsWith("alarm_control_panel.");
const nameOf = (state: HaState) => (typeof state.attributes?.friendly_name === "string" ? state.attributes.friendly_name : state.entity_id);

export class AlarmUnavailableError extends HttpError {
  constructor(message = "The alarm panel is not available") {
    super(503, "alarm_unavailable", message);
  }
}

async function chosenPanel(householdId: string): Promise<HaState | null> {
  const settings = await db.homeAssistantSettings.findUnique({ where: { householdId }, select: { alarmEntityId: true } });
  if (settings?.alarmEntityId) return getEntityState(settings.alarmEntityId);
  const panels = getEntityStates()
    .filter(isPanel)
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return panels[0] ?? null;
}

function toPanel(state: HaState): AlarmPanel {
  const features = Number(state.attributes?.supported_features ?? 0);
  const codeFormat = state.attributes?.code_format;
  return {
    entityId: state.entity_id,
    name: nameOf(state),
    state: toAlarmState(state.state),
    codeArmRequired: state.attributes?.code_arm_required === true,
    codeFormat: codeFormat === "number" || codeFormat === "text" ? codeFormat : null,
    // Without supported_features (older integrations) assume both.
    supportsArmHome: !features || (features & SUPPORT_ARM_HOME) !== 0,
    supportsArmAway: !features || (features & SUPPORT_ARM_AWAY) !== 0,
    changedAt: state.last_changed ?? null,
  };
}

type CompressedState = { s?: string; state?: string; lu?: number; lc?: number; last_changed?: string; last_updated?: string };

/** `history/history_during_period` → state changes, newest first (consecutive duplicates removed). */
export function parseAlarmHistory(raw: unknown, entityId: string): AlarmHistoryEntry[] {
  const rows = (raw && typeof raw === "object" ? (raw as Record<string, CompressedState[]>)[entityId] : undefined) ?? [];
  const entries: AlarmHistoryEntry[] = [];
  for (const row of rows) {
    const state = toAlarmState(row.s ?? row.state);
    const seconds = row.lc ?? row.lu;
    const at = typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : (row.last_changed ?? row.last_updated ?? null);
    if (!at) continue;
    if (entries.at(-1)?.state === state) continue;
    entries.push({ state, at });
  }
  return entries.reverse();
}

async function loadHistory(entityId: string): Promise<AlarmHistoryEntry[]> {
  try {
    const raw = await requireConnectedClient().sendCommand({
      type: "history/history_during_period",
      start_time: new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
    return parseAlarmHistory(raw, entityId).slice(0, 30);
  } catch (error) {
    console.warn("[home-assistant] alarm history unavailable:", (error as Error).message);
    return [];
  }
}

async function loadLog(householdId: string): Promise<AlarmLogEntry[]> {
  const rows = await db.alarmActionLog.findMany({ where: { householdId }, orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actorName,
    action: row.action.toLowerCase() as AlarmActionKind,
    result: row.result.toLowerCase() as AlarmActionResultKind,
    detail: row.detail,
    at: row.createdAt.toISOString(),
  }));
}

export async function getAlarmOverview(householdId: string, { includeLog }: { includeLog: boolean }): Promise<AlarmOverview> {
  const status = await connectionStatusFor(householdId);
  const log = includeLog ? await loadLog(householdId) : [];
  if (!status.linked || status.state !== "connected") return { status, panel: null, panels: [], history: [], log };
  const panelState = await chosenPanel(householdId);
  const panels = getEntityStates()
    .filter(isPanel)
    .map((state) => ({ entityId: state.entity_id, name: nameOf(state) }));
  return {
    status,
    panel: panelState ? toPanel(panelState) : null,
    panels,
    history: panelState ? await loadHistory(panelState.entity_id) : [],
    log,
  };
}

async function audit(
  householdId: string,
  actor: AlarmActor,
  action: AlarmActionKind,
  result: AlarmActionResultKind,
  entityId: string | null,
  detail: string | null,
) {
  try {
    await db.alarmActionLog.create({
      data: {
        householdId,
        userId: actor.userId,
        actorName: actor.kind === "user" ? actor.name : `${actor.kind}:${actor.name}`,
        action: ACTION_ROW[action],
        result: RESULT_ROW[result],
        entityId,
        detail: detail?.slice(0, 300) ?? null,
      },
    });
  } catch (error) {
    console.error("[home-assistant] could not write the alarm audit log", error);
  }
  // Mirrored into the household activity log (Settings → Activity); `detail` never holds the code (scrubCode).
  await recordAudit(
    { householdId, userId: actor.userId, name: actor.name, channel: ALARM_AUDIT_CHANNEL[actor.kind] },
    {
      action: result === "succeeded" ? ALARM_AUDIT_ACTION[action] : "alarm.attempt_failed",
      targetType: "alarm",
      targetId: entityId,
      targetLabel: entityId,
      summary: result === "succeeded" ? null : `${action} ${result}${detail ? `: ${detail}` : ""}`,
    },
  );
  console.log(`[home-assistant] alarm ${action} by ${actor.kind}:${actor.userId ?? "?"} → ${result}`);
}

const ALARM_AUDIT_CHANNEL: Record<AlarmActor["kind"], AuditChannel> = { user: "app", assistant: "assistant", voice: "assistant", mcp: "mcp" };
const ALARM_AUDIT_ACTION: Record<AlarmActionKind, AuditAction> = { arm_home: "alarm.armed_home", arm_away: "alarm.armed_away", disarm: "alarm.disarmed" };

async function panelFor(householdId: string): Promise<HaState> {
  if (!(await isHaHousehold(householdId))) throw new AlarmUnavailableError("Home Assistant is not configured");
  requireConnectedClient();
  const panel = await chosenPanel(householdId);
  if (!panel) throw new AlarmUnavailableError("Home Assistant has no alarm panel");
  return panel;
}

const haErrorText = (error: unknown) =>
  error instanceof HaCommandError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);

/** Arms the panel. The route only calls this with `confirm: true` (alarmArmInputSchema). */
export async function armAlarm(householdId: string, actor: AlarmActor, mode: "home" | "away", code?: string): Promise<AlarmActionResponse> {
  const action: AlarmActionKind = mode === "home" ? "arm_home" : "arm_away";
  try {
    assertAlarmActionAllowed(action, actor);
  } catch (error) {
    await audit(householdId, actor, action, "refused", null, (error as Error).message);
    throw new HttpError(403, "forbidden", (error as Error).message);
  }
  let panel: HaState;
  try {
    panel = await panelFor(householdId);
  } catch (error) {
    await audit(householdId, actor, action, "refused", null, (error as Error).message);
    throw error instanceof HaNotConnectedError ? new AlarmUnavailableError(error.message) : error;
  }
  const info = toPanel(panel);
  if (info.codeArmRequired && !code) {
    await audit(householdId, actor, action, "refused", panel.entity_id, "Code required to arm");
    throw new HttpError(400, "code_required", "This alarm panel needs the code to arm");
  }
  try {
    await requireConnectedClient().sendCommand({
      type: "call_service",
      domain: "alarm_control_panel",
      service: mode === "home" ? "alarm_arm_home" : "alarm_arm_away",
      service_data: code ? { code } : {},
      target: { entity_id: panel.entity_id },
    });
  } catch (error) {
    const detail = scrubCode(haErrorText(error), code);
    await audit(householdId, actor, action, "failed", panel.entity_id, detail);
    throw new HttpError(502, "alarm_failed", "Home Assistant could not arm the alarm");
  }
  await audit(householdId, actor, action, "succeeded", panel.entity_id, null);
  return { ok: true, state: toAlarmState(getEntityState(panel.entity_id)?.state) };
}

/**
 * Disarms the panel with the code. UI only: the actor must be a signed-in owner or adult (`kind: "user"`).
 * Never exposed to the assistant, MCP or voice.
 */
export async function disarmAlarm(householdId: string, actor: AlarmActor, code: string): Promise<AlarmActionResponse> {
  try {
    assertAlarmActionAllowed("disarm", actor);
  } catch (error) {
    await audit(householdId, actor, "disarm", "refused", null, (error as Error).message);
    if (error instanceof AlarmRefusedError) throw new HttpError(403, "forbidden", error.message);
    throw error;
  }
  try {
    disarmPerUser.hit(actor.userId ?? "unknown");
    disarmPerHousehold.hit(householdId);
  } catch (error) {
    await audit(householdId, actor, "disarm", "rate_limited", null, "Too many attempts");
    throw error;
  }
  let panel: HaState;
  try {
    panel = await panelFor(householdId);
  } catch (error) {
    await audit(householdId, actor, "disarm", "refused", null, (error as Error).message);
    throw error instanceof HaNotConnectedError ? new AlarmUnavailableError(error.message) : error;
  }
  try {
    await requireConnectedClient().disarmAlarmPanel(panel.entity_id, code);
  } catch (error) {
    const detail = scrubCode(haErrorText(error), code);
    await audit(householdId, actor, "disarm", "failed", panel.entity_id, detail);
    // Home Assistant says "Invalid alarm code" (or the integration's own text) for a wrong code.
    throw new HttpError(422, "alarm_disarm_failed", "Home Assistant refused to disarm (wrong code?)");
  }
  await audit(householdId, actor, "disarm", "succeeded", panel.entity_id, null);
  return { ok: true, state: toAlarmState(getEntityState(panel.entity_id)?.state) };
}

let started = false;

/** Streams alarm panel state changes to the household's browsers (`alarm.state`). */
export function startAlarmEvents(): void {
  if (started) return;
  started = true;
  onEntityState((entityId, state) => {
    if (!entityId.startsWith("alarm_control_panel.")) return;
    void haHouseholdId()
      .then((householdId) => {
        if (!householdId) return;
        publish<AlarmStateEvent>(householdId, ALARM_STATE_EVENT, {
          entityId,
          state: toAlarmState(state?.state),
          at: state?.last_changed ?? new Date().toISOString(),
        });
      })
      .catch(() => undefined);
  });
}
