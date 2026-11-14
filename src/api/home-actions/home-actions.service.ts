import { randomUUID } from "node:crypto";
import { z } from "zod";
import { homeActionInputSchema, homeRuleInputSchema, type ActionStepResult, type HomeActionInput, type HomeActionsOverview, type HomeActionPreview, type HomeRuleInput } from "@/features/home-actions/types/home-actions";
import type { SessionUser } from "@/features/auth/types/auth";
import { appActor, audit } from "../audit/audit.service";
import { db, type Prisma, type HomeAction as ActionRow, type HomeActionRun as RunRow } from "../lib/db";
import { HttpError } from "../lib/http";
import { publish } from "../lib/events";
import { armAlarm, getAlarmOverview } from "../home-assistant/ha-alarm";
import { connectionStatusFor, getEntityState, getEntityStates, requireConnectedClient } from "../home-assistant/ha-connection";
import { describeControl, systemTemperatureUnit, validateControlRequest } from "../home-assistant/ha-control";
import { canonicalSteps, compileDispatcher, compileRule, DISPATCHER, DISPATCHER_ENTITY, outcomeExpression, outcomeSatisfied, type PublishedAction } from "./home-action-compiler";
import { configurationMatches, publishConfiguration, publishingReady } from "./ha-action-config";

export const ACTIVE_RUNS = ["requested", "running", "arming"];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const contacts = (value: { haEntityId: string | null }) => value.haEntityId?.startsWith("binary_sensor.") && ["window", "door", "opening", "garage_door"].includes(String(getEntityState(value.haEntityId)?.attributes.device_class)) ? [value.haEntityId] : [];
const requireAdult = (user: SessionUser) => { if (user.role === "child") throw new HttpError(403, "forbidden", "Only adults can manage and run household actions"); };
const changed = (householdId: string) => publish(householdId, "home_actions.changed", {});
const actionData = (row: ActionRow) => ({ ...homeActionInputSchema.parse(row.definition), id: row.id, revision: row.revision, publishedRevision: row.publishedRevision, updatedAt: row.updatedAt.toISOString() });
export const runData = (row: RunRow) => ({ id: row.id, actionId: row.actionId, name: homeActionInputSchema.parse(row.snapshot).name, revision: row.revision, actorName: row.actorName, source: row.source, status: row.status, steps: row.steps as ActionStepResult[], startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null, detail: row.detail });
export function publishedAction(row: ActionRow): PublishedAction | null {
  if (!row.publishedRevision || !row.published) return null;
  const value = z.object({ definition: homeActionInputSchema, contacts: z.array(z.string().regex(/^binary_sensor\.[a-z0-9_]+$/)), alarmEntityId: z.string().regex(/^alarm_control_panel\.[a-z0-9_]+$/).nullable() }).parse(row.published);
  return { id: row.id, revision: row.publishedRevision, ...value };
}
async function findAction(householdId: string, id: string) {
  const row = await db.homeAction.findFirst({ where: { id, householdId, archived: false } });
  if (!row) throw new HttpError(404, "not_found", "Action not found");
  return row;
}
async function deviceRows(householdId: string) {
  return db.device.findMany({ where: { householdId }, include: { values: true, place: true }, orderBy: { name: "asc" } });
}

export async function homeActionsOverview(user: SessionUser): Promise<HomeActionsOverview> {
  const [actions, rules, runs, devices, status] = await Promise.all([
    db.homeAction.findMany({ where: { householdId: user.householdId, archived: false }, orderBy: { createdAt: "asc" } }),
    db.homeRule.findMany({ where: { householdId: user.householdId }, orderBy: { createdAt: "asc" } }),
    db.homeActionRun.findMany({ where: { householdId: user.householdId }, orderBy: { startedAt: "desc" }, take: 50 }),
    deviceRows(user.householdId), connectionStatusFor(user.householdId),
  ]);
  const connected = status.linked && status.state === "connected";
  const unit = connected ? await systemTemperatureUnit() : null;
  return { actions: actions.map(actionData), rules: rules.map((row) => ({ ...homeRuleInputSchema.parse(row.definition), id: row.id, revision: row.revision, publishedRevision: row.publishedRevision })), runs: runs.map(runData),
    devices: devices.map((device) => ({ id: device.id, name: device.name, room: device.place?.name ?? null, notes: device.notes,
      controls: user.role === "child" || !connected ? [] : [...new Set(device.values.flatMap((value) => value.source === "HOME_ASSISTANT" && value.haEntityId ? [value.haEntityId] : []))].flatMap((id) => { const state = getEntityState(id); const control = state ? describeControl(state, unit) : null; return control ? [control] : []; }),
      contactEntityIds: device.values.filter((value) => value.source === "HOME_ASSISTANT").flatMap(contacts),
      observations: [...new Set(device.values.filter((value) => value.source === "HOME_ASSISTANT" && value.haEntityId).map((value) => value.haEntityId!))].map((entityId) => ({ entityId, state: getEntityState(entityId)?.state ?? "unknown" })),
    })), connected, publishingReady: user.role !== "child" && connected ? await publishingReady() : false };
}

async function resolveDefinition(householdId: string, input: HomeActionInput) {
  const definition = { ...input, steps: canonicalSteps(input.steps) };
  const devices = await deviceRows(householdId), byId = new Map(devices.map((row) => [row.id, row]));
  const contactEntities = new Set<string>();
  for (const id of definition.contactDeviceIds) {
    const device = byId.get(id);
    const ids = device?.values.filter((value) => value.source === "HOME_ASSISTANT").flatMap(contacts) ?? [];
    if (!ids.length) throw new HttpError(400, "bad_request", "A selected contact is not available in this household");
    ids.forEach((entityId) => contactEntities.add(entityId));
  }
  const unit = await systemTemperatureUnit();
  for (const step of definition.steps) {
    if (step.kind === "wait") continue;
    const device = byId.get(step.deviceId), state = getEntityState(step.entityId);
    if (!device?.values.some((value) => value.source === "HOME_ASSISTANT" && value.haEntityId === step.entityId) || !state) throw new HttpError(400, "bad_request", "Action targets must belong to a linked device in this household");
    // An offline entity can retain its known capabilities, so a 'continue' step can still be published.
    validateControlRequest(describeControl({ ...state, state: state.state === "unavailable" || state.state === "unknown" ? "off" : state.state }, unit), step);
    if (!outcomeExpression(step)) throw new HttpError(400, "bad_request", "This action has no observable result and cannot be used in a routine");
  }
  const alarm = definition.alarmMode ? await getAlarmOverview(householdId, { includeLog: false }) : null;
  if (definition.alarmMode && (!alarm?.panel || (definition.alarmMode === "home" ? !alarm.panel.supportsArmHome : !alarm.panel.supportsArmAway))) throw new HttpError(400, "bad_request", "The selected alarm mode is unavailable");
  return { definition, contacts: [...contactEntities], alarmEntityId: alarm?.panel?.entityId ?? null };
}

export async function saveHomeAction(user: SessionUser, id: string | null, input: HomeActionInput, revision?: number) {
  requireAdult(user);
  let definition: HomeActionInput;
  try { definition = { ...input, steps: canonicalSteps(input.steps) }; } catch (error) { throw new HttpError(400, "action_conflict", (error as Error).message); }
  // Definitions can be edited during an outage. Targets are checked against the household now and capabilities at publication.
  const devices = await deviceRows(user.householdId);
  for (const step of definition.steps) if (step.kind === "device" && !devices.some((device) => device.id === step.deviceId && device.values.some((value) => value.source === "HOME_ASSISTANT" && value.haEntityId === step.entityId))) throw new HttpError(400, "bad_request", "Unknown device target");
  if (definition.contactDeviceIds.some((contactId) => !devices.some((device) => device.id === contactId))) throw new HttpError(400, "bad_request", "Unknown contact");
  const row = id ? await db.homeAction.updateManyAndReturn({ where: { id, householdId: user.householdId, archived: false, revision: revision ?? -1 }, data: { definition: json(definition), revision: { increment: 1 } } }).then((rows) => rows[0])
    : await db.homeAction.create({ data: { householdId: user.householdId, definition: json(definition) } });
  if (!row) throw new HttpError(409, "revision_conflict", "This action changed. Reload before saving.");
  await audit(appActor(user), { action: "home_action.saved", targetType: "home_action", targetId: row.id, targetLabel: definition.name });
  changed(user.householdId);
  return actionData(row);
}

export async function previewHomeAction(user: SessionUser, id: string): Promise<HomeActionPreview> {
  requireAdult(user);
  const row = await findAction(user.householdId, id), input = homeActionInputSchema.parse(row.definition);
  const issues: string[] = [];
  const status = await connectionStatusFor(user.householdId);
  if (!status.linked || status.state !== "connected") issues.push("Home Assistant is disconnected");
  let resolved: Awaited<ReturnType<typeof resolveDefinition>> | null = null;
  try { resolved = await resolveDefinition(user.householdId, input); } catch (error) { issues.push(error instanceof HttpError ? error.message : "Invalid action definition"); }
  for (const entityId of resolved?.contacts ?? []) if (getEntityState(entityId)?.state !== "off") issues.push(`Contact open or unavailable: ${entityId}`);
  const devices = await deviceRows(user.householdId);
  const steps = input.steps.map((step, index) => {
    if (step.kind === "wait") return { index, label: `Wait ${step.seconds} s`, entityId: null, alreadySatisfied: false };
    const state = getEntityState(step.entityId);
    if ((!state || ["unknown", "unavailable"].includes(state.state)) && step.onFailure === "stop") issues.push(`Device unavailable: ${devices.find((device) => device.id === step.deviceId)?.name ?? step.entityId}`);
    return { index, label: `${devices.find((device) => device.id === step.deviceId)?.name ?? step.entityId} · ${step.action}${step.value === undefined ? "" : ` ${step.value}`}${step.option ? ` ${step.option}` : ""}`, entityId: step.entityId, alreadySatisfied: outcomeSatisfied(step, state) };
  });
  return { ready: !issues.length, issues, steps, alarmMode: input.alarmMode };
}

async function lock<T>(householdId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${householdId}), 20261114)::text`; return work(tx); }, { timeout: 60_000 });
}
function assertIdle(active: number) {
  if (active || getEntityState(DISPATCHER_ENTITY)?.state === "on") throw new HttpError(409, "action_busy", "A household action is running. Wait or stop it first.");
}
export async function publishHomeAction(user: SessionUser, id: string, revision: number) {
  requireAdult(user);
  const row = await findAction(user.householdId, id);
  if (row.revision !== revision) throw new HttpError(409, "revision_conflict", "Reload the latest action before publishing");
  const candidate = await resolveDefinition(user.householdId, homeActionInputSchema.parse(row.definition));
  if (candidate.definition.alarmMode) {
    const linked = await db.homeRule.findMany({ where: { householdId: user.householdId, actionId: id, publishedRevision: { not: null } } });
    if (linked.some((rule) => (rule.published as { initial_state?: boolean } | null)?.initial_state === true)) throw new HttpError(409, "manual_alarm_required", "Disable and publish linked automations before adding a manual alarm step");
  }
  const next: PublishedAction = { id, revision, ...candidate };
  await lock(user.householdId, async (tx) => {
    assertIdle(await tx.homeActionRun.count({ where: { householdId: user.householdId, status: { in: ACTIVE_RUNS } } }));
    const rows = await tx.homeAction.findMany({ where: { householdId: user.householdId, archived: false } });
    if (rows.find((item) => item.id === id)?.revision !== revision) throw new HttpError(409, "revision_conflict", "Reload the latest action");
    const current = rows.flatMap((item) => { const itemPublished = publishedAction(item); return itemPublished ? [itemPublished] : []; });
    const states = new Map(getEntityStates().map((state) => [state.entity_id, state]));
    await publishConfiguration("script", DISPATCHER, current.length ? compileDispatcher(current, states) : null, compileDispatcher([...current.filter((item) => item.id !== id), next].sort((a, b) => rows.findIndex((r) => r.id === a.id) - rows.findIndex((r) => r.id === b.id)), states));
    await tx.homeAction.update({ where: { id }, data: { published: json(candidate), publishedRevision: revision } });
  });
  // Native rules address the action identity. Only explicitly published action versions are executable;
  // publishing an action must never implicitly publish a rule's unrelated draft or enablement changes.
  await audit(appActor(user), { action: "home_action.published", targetType: "home_action", targetId: id, targetLabel: candidate.definition.name });
  changed(user.householdId);
}

export async function startHomeAction(user: SessionUser, id: string, input: { revision: number; requestKey: string; code?: string }) {
  requireAdult(user);
  const existing = await db.homeActionRun.findUnique({ where: { householdId_requestKey: { householdId: user.householdId, requestKey: input.requestKey } } });
  if (existing) { if (existing.actionId !== id) throw new HttpError(409, "request_conflict", "Request key already used"); return runData(existing); }
  const row = await findAction(user.householdId, id), published = publishedAction(row);
  if (!published || row.revision !== row.publishedRevision || published.revision !== input.revision) throw new HttpError(409, "not_published", "Publish the current action before running it");
  const preview = await previewHomeAction(user, id);
  if (!preview.ready) throw new HttpError(409, "action_blocked", preview.issues.join("; "));
  const all = await db.homeAction.findMany({ where: { householdId: user.householdId, archived: false } });
  const states = new Map(getEntityStates().map((state) => [state.entity_id, state]));
  if (!await configurationMatches("script", DISPATCHER, compileDispatcher(all.flatMap((item) => { const value = publishedAction(item); return value ? [value] : []; }), states))) throw new HttpError(409, "ha_drift", "The HA action configuration changed. Review it before running.");
  const run = await lock(user.householdId, async (tx) => {
    const duplicate = await tx.homeActionRun.findUnique({ where: { householdId_requestKey: { householdId: user.householdId, requestKey: input.requestKey } } });
    if (duplicate) return { row: duplicate, created: false };
    const current = await tx.homeAction.findFirst({ where: { id, householdId: user.householdId, revision: input.revision, publishedRevision: input.revision } });
    if (!current) throw new HttpError(409, "revision_conflict", "The action changed before starting");
    assertIdle(await tx.homeActionRun.count({ where: { householdId: user.householdId, status: { in: ACTIVE_RUNS } } }));
    return { row: await tx.homeActionRun.create({ data: { id: randomUUID(), householdId: user.householdId, actionId: id, revision: published.revision, snapshot: json(published.definition), actorName: user.name, source: "app", requestKey: input.requestKey } }), created: true };
  });
  // Code exists only in this transient closure and is never persisted, templated or sent to an HA script.
  if (run.created) {
    void launch(run.row.id, user, published, input.code);
    await audit(appActor(user), { action: "home_action.started", targetType: "home_action", targetId: id, targetLabel: published.definition.name });
  }
  changed(user.householdId);
  return runData(run.row);
}

async function launch(runId: string, user: SessionUser, action: PublishedAction, code?: string) {
  try {
    await requireConnectedClient().sendCommand({ type: "call_service", domain: "script", service: "turn_on", target: { entity_id: DISPATCHER_ENTITY }, service_data: { variables: { wh_action_id: action.id, wh_revision: action.revision, run_id: runId, manual_gate: !!action.definition.alarmMode } } });
    if (action.definition.alarmMode) {
      // The single HA executor must reserve this run before the alarm is touched.
      const reservationDeadline = Date.now() + 10_000;
      while (!(await db.homeActionRun.findFirst({ where: { id: runId, status: "arming" } }))) {
        if (Date.now() > reservationDeadline) throw new Error("Executor reservation not confirmed");
        const current = await db.homeActionRun.findUnique({ where: { id: runId } });
        if (!current || !ACTIVE_RUNS.includes(current.status)) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (action.contacts.some((entityId) => getEntityState(entityId)?.state !== "off")) throw new Error("Contacts changed before alarm confirmation");
      await armAlarm(user.householdId, { kind: "user", userId: user.id, name: user.name, role: user.role }, action.definition.alarmMode, code);
      const deadline = Date.now() + 120_000;
      while (getEntityState(action.alarmEntityId!)?.state !== `armed_${action.definition.alarmMode}`) {
        if (Date.now() > deadline) throw new Error("Alarm did not confirm");
        if (!(await db.homeActionRun.findFirst({ where: { id: runId, status: { in: ACTIVE_RUNS } } }))) return;
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      if (!(await db.homeActionRun.findFirst({ where: { id: runId, status: "arming" } }))) return;
      await requireConnectedClient().sendCommand({ type: "fire_event", event_type: "wickedhome_alarm_gate", event_data: { run_id: runId } });
    }
    // A competing native trigger can take the single executor. Never leave an unstarted request stuck.
    setTimeout(() => { void db.homeActionRun.updateMany({ where: { id: runId, status: { in: ["requested", "arming"] } }, data: { status: "interrupted", detail: "Execution was not confirmed. Check the actual device states before retrying.", finishedAt: new Date() } }).then(() => changed(user.householdId)); }, 20_000).unref();
  } catch {
    // Cancelling a failed gate sends no new device/alarm command. It releases only our reserved script.
    const ownRun = await db.homeActionRun.findFirst({ where: { id: runId, status: "arming" } });
    if (ownRun && getEntityState(DISPATCHER_ENTITY)?.state === "on") {
      try { await requireConnectedClient().sendCommand({ type: "call_service", domain: "script", service: "turn_off", target: { entity_id: DISPATCHER_ENTITY } }); } catch { /* Connection loss is reported below; never retry a physical step. */ }
    }
    await db.homeActionRun.updateMany({ where: { id: runId, status: { in: ACTIVE_RUNS } }, data: { status: "failed", detail: action.definition.alarmMode ? "Alarm or execution not confirmed; remaining steps were not started." : "Home Assistant did not start this action.", finishedAt: new Date() } });
    changed(user.householdId);
  }
}

export async function stopHomeAction(user: SessionUser, id: string) {
  requireAdult(user);
  const run = await db.homeActionRun.findFirst({ where: { id, householdId: user.householdId, status: { in: ACTIVE_RUNS } } });
  if (!run) throw new HttpError(404, "not_found", "Active run not found");
  // Stop first: do not report 'stopped' if HA couldn't accept the cancellation.
  if (getEntityState(DISPATCHER_ENTITY)?.state === "on") await requireConnectedClient().sendCommand({ type: "call_service", domain: "script", service: "turn_off", target: { entity_id: DISPATCHER_ENTITY } });
  await db.homeActionRun.updateMany({ where: { id, householdId: user.householdId, status: { in: ACTIVE_RUNS } }, data: { status: "cancelled", finishedAt: new Date(), detail: "Stopped. Changes already made are retained." } });
  await audit(appActor(user), { action: "home_action.stopped", targetType: "home_action", targetId: run.actionId, targetLabel: homeActionInputSchema.parse(run.snapshot).name });
  changed(user.householdId);
}

export async function saveHomeRule(user: SessionUser, id: string | null, input: HomeRuleInput, revision?: number) {
  requireAdult(user);
  const action = await findAction(user.householdId, input.actionId);
  if (homeActionInputSchema.parse(action.definition).alarmMode) throw new HttpError(400, "manual_alarm_required", "An action with an alarm step must be started manually");
  if (input.trigger.kind === "state") {
    const trigger = input.trigger;
    const device = await db.device.findFirst({ where: { id: trigger.deviceId, householdId: user.householdId }, include: { values: true } });
    if (!device?.values.some((value) => value.source === "HOME_ASSISTANT" && value.haEntityId === trigger.entityId)) throw new HttpError(400, "bad_request", "Unknown trigger device");
    if (["unavailable", "unknown"].includes(trigger.to)) throw new HttpError(400, "bad_request", "Unavailable and unknown are not physical triggers");
  }
  const row = id ? await db.homeRule.updateManyAndReturn({ where: { id, householdId: user.householdId, revision: revision ?? -1 }, data: { actionId: input.actionId, definition: json(input), revision: { increment: 1 } } }).then((rows) => rows[0])
    : await db.homeRule.create({ data: { householdId: user.householdId, actionId: input.actionId, definition: json(input) } });
  if (!row) throw new HttpError(409, "revision_conflict", "This rule changed. Reload before saving.");
  changed(user.householdId);
  return { ...input, id: row.id, revision: row.revision, publishedRevision: row.publishedRevision };
}

export async function publishHomeRule(user: SessionUser, id: string, revision: number) {
  requireAdult(user);
  await lock(user.householdId, async (tx) => {
    const row = await tx.homeRule.findFirst({ where: { id, householdId: user.householdId, revision } });
    if (!row) throw new HttpError(409, "revision_conflict", "Reload the rule before publishing");
    const input = homeRuleInputSchema.parse(row.definition), action = await tx.homeAction.findFirst({ where: { id: row.actionId, householdId: user.householdId, archived: false } });
    const published = action && publishedAction(action);
    if (!published || action.revision !== action.publishedRevision) throw new HttpError(409, "not_published", "Publish the current action first");
    if (published.definition.alarmMode) throw new HttpError(400, "manual_alarm_required", "Alarm actions require a manual start");
    const native = compileRule(id, input, { id: action.id, revision: published.revision });
    await publishConfiguration("automation", `wickedhome_${id}`, row.published, native);
    await tx.homeRule.update({ where: { id }, data: { published: json(native), publishedRevision: revision } });
  });
  await audit(appActor(user), { action: "home_rule.published", targetType: "home_rule", targetId: id });
  changed(user.householdId);
}
