import type { Role } from "@/features/auth/types/auth";
import { zonedParts, zonedToUtc } from "@/features/calendar/types/calendar-time";
import {
  DEFAULT_QUIET_HOURS,
  isQuietTime,
  kindPreferenceSchema,
  minutesOfDay,
  quietHoursSchema,
  resolveKindPreference,
  type NotificationPreferences,
  type QuietHours,
} from "@/features/notifications/types/notifications";
import { addDays } from "@/types/dates";
import { kindAllowsRole, kindInfoFor, type NotificationKindDefinition } from "./notification-kinds";

/*
 * Who gets what, and when (pure; tested in notifications.test.ts):
 * - the kind must allow the person's role, and be on for them (their choice, else the kind's default);
 * - a scoped kind (devices) only reaches people whose scope contains one of the event's scope ids;
 * - inside quiet hours a notification is stored at once, but its push waits until the quiet hours end
 *   (the dispatch job sends it then if it is still unread); urgent ones (the alarm) are pushed right away, and
 *   so are kinds with `bypassQuietHours` (a task reminder the person set for that moment).
 */

export type Delivery =
  | { deliver: false; reason: "role" | "disabled" | "scope" }
  | { deliver: true; push: "now" }
  | { deliver: true; push: "held"; until: Date };

/** Stored preferences (a row's JSON) → the contract shape, defaults for anything missing or malformed. */
export function parsePreferences(row: { quietHoursEnabled: boolean; quietStart: string; quietEnd: string; kinds: unknown } | null): NotificationPreferences {
  if (!row) return { quietHours: DEFAULT_QUIET_HOURS, kinds: {} };
  const quiet = quietHoursSchema.safeParse({ enabled: row.quietHoursEnabled, start: row.quietStart, end: row.quietEnd });
  const kinds: NotificationPreferences["kinds"] = {};
  if (row.kinds && typeof row.kinds === "object" && !Array.isArray(row.kinds)) {
    for (const [id, value] of Object.entries(row.kinds as Record<string, unknown>)) {
      const parsed = kindPreferenceSchema.safeParse(value);
      if (parsed.success) kinds[id] = parsed.data;
    }
  }
  return { quietHours: quiet.success ? quiet.data : DEFAULT_QUIET_HOURS, kinds };
}

/** When the quiet hours that contain `now` end, as an instant (Europe/Brussels); null when `now` isn't quiet. */
export function quietHoursEnd(quiet: QuietHours, now: Date): Date | null {
  const { date, minutes } = zonedParts(now);
  if (!isQuietTime(quiet, minutes)) return null;
  const endDate = minutesOfDay(quiet.end) > minutes ? date : addDays(date, 1);
  return zonedToUtc(endDate, quiet.end);
}

export function decideDelivery({
  kind,
  role,
  preferences,
  now,
  scopeIds,
  urgent,
}: {
  kind: NotificationKindDefinition;
  role: Role;
  preferences: NotificationPreferences;
  now: Date;
  scopeIds?: string[];
  urgent?: boolean;
}): Delivery {
  if (!kindAllowsRole(kind, role)) return { deliver: false, reason: "role" };
  const setting = resolveKindPreference(kindInfoFor(kind, role), preferences.kinds[kind.id]);
  if (!setting.enabled) return { deliver: false, reason: "disabled" };
  if (kind.scoped && !(scopeIds ?? []).some((id) => setting.scope.includes(id))) return { deliver: false, reason: "scope" };
  if ((urgent ?? kind.urgent ?? false) || kind.bypassQuietHours) return { deliver: true, push: "now" };
  const until = quietHoursEnd(preferences.quietHours, now);
  return until ? { deliver: true, push: "held", until } : { deliver: true, push: "now" };
}

/**
 * Has a scheduled kind's time come for this person today? `time` is `HH:MM` (Europe/Brussels); it is due from
 * that minute on, for `graceMinutes` (so a server that was down at 08:00 still sends at 08:20, not at 23:00).
 */
export function isTimeDue(time: string, now: Date, graceMinutes = 180): boolean {
  const { minutes } = zonedParts(now);
  const at = minutesOfDay(time);
  return minutes >= at && minutes < at + graceMinutes;
}
