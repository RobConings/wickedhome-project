import { resolveKindPreference } from "@/features/notifications/types/notifications";
import type { Locale } from "@/types/common";
import { getNotificationKind, kindAllowsRole, kindInfoFor } from "./notification-kinds";
import { loadRecipients, type NotifyInput } from "./notify";

/**
 * Scheduled notifiers: checks that features register to send notifications at a time of day (the bins the
 * evening before, the morning task digest, payments, vouchers…) or when a condition has lasted a while (Home
 * Assistant offline). The job `notifications.dispatch` (every 5 minutes) runs all of them, one after the
 * other; each decides itself whether anything is due (`isTimeDue` with the person's chosen time) and relies on
 * notify()'s tag de-duplication, so running twice sends nothing twice.
 *
 *   registerScheduledNotifier({ id: "waste.bins", run: async ({ now, log }) => { … await notify(…) … } });
 */

export type ScheduledNotifierContext = {
  now: Date;
  signal: AbortSignal;
  log: (message: string) => void;
};

export type ScheduledNotifier = {
  id: string;
  /** Returns how many notifications it stored (for the run summary). */
  run: (ctx: ScheduledNotifierContext) => Promise<number>;
};

const notifiers = new Map<string, ScheduledNotifier>();

/** Registers (or, on a dev reload, replaces) a notifier. */
export function registerScheduledNotifier(notifier: ScheduledNotifier): void {
  notifiers.set(notifier.id, notifier);
}

export const listScheduledNotifiers = () => [...notifiers.values()];

export type TimedRecipient = { userId: string; locale: Locale; time: string | null };

/**
 * The people a scheduled kind would reach (same recipient rules as notify()), with each person's chosen time
 * (or the kind's default). Only those who have it on. The notifier then keeps the ones whose time has come.
 */
export async function recipientsWithTime(
  input: Pick<NotifyInput, "householdId" | "userIds" | "habitantIds" | "fallbackToHousehold" | "roles" | "excludeUserIds">,
  kindId: string,
): Promise<TimedRecipient[]> {
  const kind = getNotificationKind(kindId);
  if (!kind) throw new Error(`Unknown notification kind "${kindId}"`);
  return (await loadRecipients(input)).flatMap((recipient) => {
    if (!kindAllowsRole(kind, recipient.role)) return [];
    const setting = resolveKindPreference(kindInfoFor(kind, recipient.role), recipient.preferences.kinds[kind.id]);
    return setting.enabled ? [{ userId: recipient.userId, locale: recipient.locale, time: setting.time }] : [];
  });
}
