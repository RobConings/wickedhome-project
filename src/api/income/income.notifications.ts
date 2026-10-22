import { zonedParts } from "@/features/calendar/types/calendar-time";
import { daysBetween } from "@/types/dates";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { isTimeDue } from "../notifications/notification-policy";
import { formatDay, formatMoney } from "../notifications/notification-text";
import { notify } from "../notifications/notify";
import { recipientsWithTime, registerScheduledNotifier } from "../notifications/scheduled-notifiers";
import { getVoucherBalances } from "./income.service";

/*
 * "Meal vouchers expire soon: € 23,40" (docs/NOTIFICATIONS.md): a week before vouchers expire, and again the
 * day before when they are still not used, to the person whose vouchers they are (else the owners and adults).
 */

export const VOUCHERS_KIND = "income.vouchers";
export const VOUCHER_NOTIFY_DAYS = 7;

registerNotificationKind({
  id: VOUCHERS_KIND,
  group: "money",
  titleKey: "income:notifications.vouchers.title",
  descriptionKey: "income:notifications.vouchers.description",
  times: ["08:00", "09:00", "12:00", "18:00"],
  defaultTime: "09:00",
});

/** Which reminder (if any) is due for vouchers expiring on `date` (pure): a week ahead, then the last day. */
export function voucherReminder(date: string, today: string): "week" | "last" | null {
  const left = daysBetween(today, date);
  if (left < 0 || left > VOUCHER_NOTIFY_DAYS) return null;
  return left <= 1 ? "last" : "week";
}

async function notifyHousehold(householdId: string, now: Date): Promise<number> {
  const today = zonedParts(now).date;
  let stored = 0;
  for (const balance of await getVoucherBalances(householdId, today)) {
    const soon = balance.expiringSoon;
    if (!soon || soon.amountCents <= 0) continue;
    const reminder = voucherReminder(soon.date, today);
    if (!reminder) continue;
    const habitant = await db.habitant.findFirst({ where: { id: balance.habitantId, householdId }, select: { name: true, user: { select: { id: true } } } });
    const own = Boolean(habitant?.user);
    const recipients = (
      await recipientsWithTime(own ? { householdId, habitantIds: [balance.habitantId] } : { householdId, roles: ["owner", "adult"] }, VOUCHERS_KIND)
    ).filter((recipient) => recipient.time && isTimeDue(recipient.time, now));
    if (recipients.length === 0) continue;
    const name = habitant?.name ?? "";
    const result = await notify({
      householdId,
      kind: VOUCHERS_KIND,
      userIds: recipients.map((recipient) => recipient.userId),
      tag: `vouchers:${balance.habitantId}:${soon.date}:${reminder}`,
      dedupeMinutes: (VOUCHER_NOTIFY_DAYS + 1) * 24 * 60,
      url: "/income",
      content: (locale) => {
        const amount = formatMoney(soon.amountCents, locale);
        const day = formatDay(soon.date, locale);
        if (locale === "nl") {
          const what = `vervallen ${reminder === "last" ? "morgen" : "binnenkort"}: ${amount}`;
          return { title: own ? `Maaltijdcheques ${what}` : `${name}: maaltijdcheques ${what}`, body: `Gebruik ze vóór ${day}.` };
        }
        const what = `expire ${reminder === "last" ? "tomorrow" : "soon"}: ${amount}`;
        return { title: own ? `Meal vouchers ${what}` : `${name}'s meal vouchers ${what}`, body: `Use them before ${day}.` };
      },
    });
    stored += result.stored;
  }
  return stored;
}

registerScheduledNotifier({
  id: VOUCHERS_KIND,
  run: async ({ now, signal }) => {
    const households = await db.income.findMany({ where: { kind: "MEAL_VOUCHERS" }, distinct: ["householdId"], select: { householdId: true } });
    let stored = 0;
    for (const { householdId } of households) {
      if (signal.aborted) break;
      stored += await notifyHousehold(householdId, now);
    }
    return stored;
  },
});
