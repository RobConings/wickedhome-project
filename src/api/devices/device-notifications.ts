import type { DeviceProfile, FieldValue, IndicatorTone, ValueSource } from "@/features/devices/types/devices";
import { evaluateIndicator, type IndicatorValues } from "@/features/devices/types/indicator";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { notifyInBackground } from "../notifications/notify";

/*
 * "Window bedroom: Open" (docs/NOTIFICATIONS.md): when a device's indicator turns orange (warning) or red
 * (danger) because of its profile's rules. Opt-in per device or per profile ("Notify me" on the device page →
 * the kind's scope `device:<id>` / `profile:<id>`). Throttled: the same device and colour at most once per
 * 30 minutes. Only evaluated for devices someone follows, so the stream of Home Assistant values costs nothing
 * otherwise.
 */

export const DEVICE_INDICATOR_KIND = "devices.indicator";

registerNotificationKind({
  id: DEVICE_INDICATOR_KIND,
  group: "devices",
  titleKey: "devices:notifications.indicator.title",
  descriptionKey: "devices:notifications.indicator.description",
  scoped: true,
});

const ALERT_TONES = new Set<IndicatorTone>(["warning", "danger"]);
const THROTTLE_MINUTES = 30;
const FOLLOWED_TTL_MS = 60_000;

/** Last tone per device (in memory; the first value after a restart only sets it). */
const lastTone = new Map<string, IndicatorTone>();
/** Per household: the scope ids anyone follows, cached for a minute. */
const followed = new Map<string, { ids: Set<string>; at: number }>();

async function followedScopes(householdId: string): Promise<Set<string>> {
  const cached = followed.get(householdId);
  if (cached && Date.now() - cached.at < FOLLOWED_TTL_MS) return cached.ids;
  const rows = await db.notificationPreference.findMany({ where: { user: { householdId, disabledAt: null } }, select: { kinds: true } });
  const ids = new Set<string>();
  for (const row of rows) {
    const setting = (row.kinds as Record<string, { enabled?: boolean; scope?: unknown } | undefined> | null)?.[DEVICE_INDICATOR_KIND];
    if (setting?.enabled === false || !Array.isArray(setting?.scope)) continue;
    for (const id of setting.scope) if (typeof id === "string") ids.add(id);
  }
  followed.set(householdId, { ids, at: Date.now() });
  return ids;
}

/** Should a tone change be told (pure)? Only into orange or red, from another tone. */
export function isIndicatorAlert(previous: IndicatorTone | undefined, next: IndicatorTone): boolean {
  return previous !== undefined && previous !== next && ALERT_TONES.has(next);
}

const TONE_WORD: Record<"warning" | "danger", { en: string; nl: string }> = {
  warning: { en: "Turned orange", nl: "Werd oranje" },
  danger: { en: "Turned red", nl: "Werd rood" },
};

/** After a device value changed (devices.service `setDeviceValue`). Never throws, never waits for the push. */
export async function checkDeviceIndicator(householdId: string, deviceId: string): Promise<void> {
  try {
    const scopes = await followedScopes(householdId);
    if (scopes.size === 0) return;
    const device = await db.device.findFirst({
      where: { id: deviceId, householdId },
      select: {
        id: true,
        name: true,
        profileId: true,
        place: { select: { name: true } },
        values: { select: { fieldKey: true, value: true, valueAt: true, source: true } },
        profile: { select: { fields: true, rules: true, primaryField: true, fallbackTone: true, fallbackLabel: true, staleAfterMinutes: true } },
      },
    });
    if (!device) return;
    const scopeIds = [`device:${device.id}`, `profile:${device.profileId}`];
    if (!scopeIds.some((id) => scopes.has(id))) return;

    const values: IndicatorValues = Object.fromEntries(
      device.values.map((row) => [
        row.fieldKey,
        { value: (row.value ?? null) as FieldValue, updatedAt: row.valueAt?.toISOString() ?? null, source: row.source.toLowerCase() as ValueSource },
      ]),
    );
    const result = evaluateIndicator(
      {
        fields: device.profile.fields as DeviceProfile["fields"],
        rules: device.profile.rules as DeviceProfile["rules"],
        primaryField: device.profile.primaryField,
        fallbackTone: device.profile.fallbackTone as IndicatorTone,
        fallbackLabel: device.profile.fallbackLabel,
        staleAfterMinutes: device.profile.staleAfterMinutes,
      },
      values,
    );
    const previous = lastTone.get(device.id);
    lastTone.set(device.id, result.tone);
    if (!isIndicatorAlert(previous, result.tone)) return;
    const tone = result.tone as "warning" | "danger";
    notifyInBackground({
      householdId,
      kind: DEVICE_INDICATOR_KIND,
      scopeIds,
      tag: `device:${device.id}:${tone}`,
      dedupeMinutes: THROTTLE_MINUTES,
      url: `/devices/${encodeURIComponent(device.id)}`,
      data: { deviceId: device.id, tone },
      content: (locale) => ({
        title: result.label ? `${device.name}: ${result.label}` : device.name,
        body: [TONE_WORD[tone][locale], device.place?.name].filter(Boolean).join(" · "),
      }),
    });
  } catch (error) {
    console.error("[notifications] device indicator check failed", error);
  }
}
