import { registerNotificationKind } from "../notifications/notification-kinds";
import { formatMoney, listOf } from "../notifications/notification-text";
import { notify } from "../notifications/notify";

/** "2 bills found in mail: Fluvius € 89,90, Telenet": after a Gmail scan found new suggestions (docs/NOTIFICATIONS.md). */
export const MAIL_BILLS_KIND = "integrations.mail-bills";

registerNotificationKind({
  id: MAIL_BILLS_KIND,
  group: "accounts",
  titleKey: "integrations:notifications.mailBills.title",
  descriptionKey: "integrations:notifications.mailBills.description",
  roles: ["owner", "adult"],
});

/** To the owners and adults. Never throws (a failing notification must not fail the mail scan). */
export async function notifyMailBills(householdId: string, found: { payee: string; amountCents: number | null }[]): Promise<void> {
  if (found.length === 0) return;
  try {
    await notify({
      householdId,
      kind: MAIL_BILLS_KIND,
      roles: ["owner", "adult"],
      url: "/expenses",
      content: (locale) => {
        const items = listOf(
          found.map((bill) => (bill.amountCents !== null ? `${bill.payee} ${formatMoney(bill.amountCents, locale)}` : bill.payee)),
          locale,
          3,
        );
        return locale === "nl"
          ? { title: found.length === 1 ? "Rekening gevonden in je mail" : `${found.length} rekeningen gevonden in je mail`, body: `${items}. Bekijk ze bij Uitgaven → Te betalen.` }
          : { title: found.length === 1 ? "Bill found in your mail" : `${found.length} bills found in your mail`, body: `${items}. Review them under Expenses → Upcoming.` };
      },
    });
  } catch (error) {
    console.error("[notifications] integrations.mail-bills failed", error);
  }
}
