import { toAlarmState, type AlarmState } from "@/features/home-assistant/types/home-assistant";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { formatClock } from "../notifications/notification-text";
import { notify } from "../notifications/notify";
import { registerScheduledNotifier } from "../notifications/scheduled-notifiers";
import type { HaState } from "./ha-client";
import { getHaClient, haHouseholdId, isHomeAssistantConfigured, onEntityState } from "./ha-connection";

/*
 * Alarm and Home Assistant notifications (docs/NOTIFICATIONS.md):
 * - alarm.triggered          the alarm went off: urgent, everyone, also in quiet hours;
 * - alarm.armed              armed (home/away/…) or disarmed, with who did it when it was done in WickedHome;
 *                            on by default for owners;
 * - home-assistant.connection Home Assistant unreachable for more than 15 minutes, and back (owners).
 * Triggered by Home Assistant's `state_changed` events (old → new state of the alarm panel).
 */

export const ALARM_TRIGGERED_KIND = "alarm.triggered";
export const ALARM_ARMED_KIND = "alarm.armed";
export const HA_CONNECTION_KIND = "home-assistant.connection";

registerNotificationKind({
  id: ALARM_TRIGGERED_KIND,
  group: "security",
  titleKey: "home-assistant:notifications.triggered.title",
  descriptionKey: "home-assistant:notifications.triggered.description",
  urgent: true,
});
registerNotificationKind({
  id: ALARM_ARMED_KIND,
  group: "security",
  titleKey: "home-assistant:notifications.armed.title",
  descriptionKey: "home-assistant:notifications.armed.description",
  defaultEnabled: ["owner"],
});
registerNotificationKind({
  id: HA_CONNECTION_KIND,
  group: "security",
  titleKey: "home-assistant:notifications.connection.title",
  descriptionKey: "home-assistant:notifications.connection.description",
  roles: ["owner"],
});

const ARMED: Partial<Record<AlarmState, { en: string; nl: string }>> = {
  armed_home: { en: "Alarm armed (home)", nl: "Alarm ingeschakeld (thuis)" },
  armed_away: { en: "Alarm armed (away)", nl: "Alarm ingeschakeld (afwezig)" },
  armed_night: { en: "Alarm armed (night)", nl: "Alarm ingeschakeld (nacht)" },
  armed_vacation: { en: "Alarm armed (vacation)", nl: "Alarm ingeschakeld (vakantie)" },
  armed_custom_bypass: { en: "Alarm armed", nl: "Alarm ingeschakeld" },
  disarmed: { en: "Alarm disarmed", nl: "Alarm uitgeschakeld" },
};
/** Transitional or unknown states: no "armed/disarmed" message to or from them. */
const SETTLED = new Set<AlarmState>(Object.keys(ARMED) as AlarmState[]);

export type AlarmChange = { kind: typeof ALARM_TRIGGERED_KIND | typeof ALARM_ARMED_KIND; state: AlarmState } | null;

/** Which notification an alarm panel's state change is worth (pure). */
export function alarmChangeOf(previous: string | null | undefined, next: string | null | undefined): AlarmChange {
  const from = toAlarmState(previous);
  const to = toAlarmState(next);
  if (from === to) return null;
  if (to === "triggered") return { kind: ALARM_TRIGGERED_KIND, state: to };
  // From triggered back to disarmed is worth knowing too; between arming/pending steps it isn't.
  if (SETTLED.has(to) && (SETTLED.has(from) || from === "triggered" || from === "arming" || from === "pending" || from === "disarming")) {
    return { kind: ALARM_ARMED_KIND, state: to };
  }
  return null;
}

const nameOf = (state: HaState | null, entityId: string) => (typeof state?.attributes?.friendly_name === "string" ? state.attributes.friendly_name : entityId);

/** Who armed or disarmed it in WickedHome in the last two minutes (the panel itself doesn't say). */
async function actorOf(householdId: string, entityId: string, state: AlarmState): Promise<string | null> {
  const action = state === "disarmed" ? "DISARM" : state === "armed_home" ? "ARM_HOME" : state === "armed_away" ? "ARM_AWAY" : null;
  if (!action) return null;
  const row = await db.alarmActionLog.findFirst({
    where: { householdId, entityId, action, result: "SUCCEEDED", createdAt: { gte: new Date(Date.now() - 2 * 60_000) } },
    orderBy: { createdAt: "desc" },
    select: { actorName: true },
  });
  return row?.actorName ?? null;
}

/** One alarm panel state change (from Home Assistant's `state_changed`; exported for the runtime check). */
export async function handleAlarmStateChange(entityId: string, state: HaState | null, previous: HaState | null): Promise<void> {
  const change = alarmChangeOf(previous?.state, state?.state);
  if (!change) return;
  const householdId = await haHouseholdId();
  if (!householdId) return;
  const settings = await db.homeAssistantSettings.findUnique({ where: { householdId }, select: { alarmEntityId: true } });
  if (settings?.alarmEntityId && settings.alarmEntityId !== entityId) return;
  const panel = nameOf(state, entityId);
  const at = state?.last_changed ? new Date(state.last_changed) : new Date();

  if (change.kind === ALARM_TRIGGERED_KIND) {
    await notify({
      householdId,
      kind: ALARM_TRIGGERED_KIND,
      tag: `alarm:triggered:${entityId}`,
      dedupeMinutes: 10,
      url: "/house",
      ttlSeconds: 3600,
      content: (locale) =>
        locale === "nl"
          ? { title: "Alarm! Het alarm gaat af", body: `${panel} · ${formatClock(at, "nl")}` }
          : { title: "Alarm! The alarm went off", body: `${panel} · ${formatClock(at, "en")}` },
    });
    return;
  }
  const actor = await actorOf(householdId, entityId, change.state);
  const title = ARMED[change.state];
  if (!title) return;
  await notify({
    householdId,
    kind: ALARM_ARMED_KIND,
    // A newer state replaces the older message on the phone.
    tag: `alarm:state:${entityId}`,
    dedupeMinutes: 0,
    url: "/house",
    content: (locale) => ({
      title: title[locale],
      body: [actor && (locale === "nl" ? `Door ${actor}` : `By ${actor}`), formatClock(at, locale), panel].filter(Boolean).join(" · "),
    }),
  });
}

let started = false;

/** Listens to the alarm panel's state changes. Called with the Home Assistant integration's start. */
export function startAlarmNotifications(): void {
  if (started) return;
  started = true;
  onEntityState((entityId, state, previous) => {
    if (!entityId.startsWith("alarm_control_panel.")) return;
    void handleAlarmStateChange(entityId, state, previous).catch((error: unknown) => console.error("[notifications] alarm notification failed", error));
  });
}

// ── Connection watch ─────────────────────────────────────────────────────────────────────────────────

/** Unreachable for this long before owners hear about it (restarts and short Wi-Fi hiccups stay quiet). */
export const HA_OFFLINE_MINUTES = 15;

let lostSince: Date | null = null;
let announced = false;

registerScheduledNotifier({
  id: HA_CONNECTION_KIND,
  run: async ({ now }) => {
    if (!isHomeAssistantConfigured()) return 0;
    const householdId = await haHouseholdId();
    if (!householdId) return 0;
    const connected = getHaClient()?.getStatus().state === "connected";
    if (!connected) {
      lostSince ??= now;
      if (announced || now.getTime() - lostSince.getTime() < HA_OFFLINE_MINUTES * 60_000) return 0;
      announced = true;
      const since = lostSince;
      const result = await notify({
        householdId,
        kind: HA_CONNECTION_KIND,
        tag: "home-assistant:connection",
        dedupeMinutes: 0,
        url: "/home-assistant",
        content: (locale) =>
          locale === "nl"
            ? { title: "Home Assistant is onbereikbaar", body: `Geen verbinding sinds ${formatClock(since, "nl")}. Alarm en toestellen worden niet bijgewerkt.` }
            : { title: "Home Assistant is unreachable", body: `No connection since ${formatClock(since, "en")}. The alarm and devices aren't updated.` },
      });
      return result.stored;
    }
    const wasAnnounced = announced;
    lostSince = null;
    announced = false;
    if (!wasAnnounced) return 0;
    const result = await notify({
      householdId,
      kind: HA_CONNECTION_KIND,
      tag: "home-assistant:connection",
      dedupeMinutes: 0,
      url: "/home-assistant",
      content: (locale) =>
        locale === "nl"
          ? { title: "Home Assistant is terug", body: "De verbinding is hersteld." }
          : { title: "Home Assistant is back", body: "The connection is restored." },
    });
    return result.stored;
  },
});
