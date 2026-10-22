import { formatDate } from "@/types/date-format";
import { addDays, todayIn } from "@/types/dates";
import { audit, jobActor } from "../audit/audit.service";
import { db } from "../lib/db";
import { registerNotificationKind } from "../notifications/notification-kinds";
import { formatMoney, listOf } from "../notifications/notification-text";
import { notify } from "../notifications/notify";
import { emitExpenseChanged } from "./expense-events";
import { toDate } from "./expense-rows";

/** "Paid by direct debit: Luminus € 89,90, Telenet € 45,00": an optional summary after the job (off by default). */
export const AUTO_PAID_KIND = "expenses.auto-paid";
registerNotificationKind({
  id: AUTO_PAID_KIND,
  group: "money",
  titleKey: "expenses:notifications.autoPaid.title",
  descriptionKey: "expenses:notifications.autoPaid.description",
  defaultEnabled: false,
  roles: ["owner", "adult"],
});

async function notifyAutoPaid(householdId: string, paid: { payee: string; amountCents: number }[]): Promise<void> {
  try {
    await notify({
      householdId,
      kind: AUTO_PAID_KIND,
      roles: ["owner", "adult"],
      url: "/expenses",
      content: (locale) => {
        const total = formatMoney(paid.reduce((sum, item) => sum + item.amountCents, 0), locale);
        const items = listOf(paid.map((item) => `${item.payee} ${formatMoney(item.amountCents, locale)}`), locale, 4);
        return locale === "nl"
          ? { title: `Betaald via domiciliëring: ${total}`, body: items }
          : { title: `Paid by direct debit: ${total}`, body: items };
      },
    });
  } catch (error) {
    console.error("[notifications] expenses.auto-paid failed", error);
  }
}

/*
 * Direct debits pay themselves: the creditor collects them on the due date. A daily job
 * (`expenses.auto-pay`) marks unpaid direct-debit expenses paid on their due date (paidOn = due date).
 *
 * - Only expenses due today or in the last AUTO_PAY_CATCH_UP_DAYS days: after a few days of downtime the
 *   job catches up, but it never touches old unpaid ones (those need a human look).
 * - `autoPaidAt` records the automatic payment. Undoing it in the UI clears `paidOn` but keeps `autoPaidAt`,
 *   so the job doesn't mark the same expense paid again the next morning.
 */
export const AUTO_PAY_CATCH_UP_DAYS = 7;

type AutoPayCandidate = {
  paymentMethod: string | null;
  /** `YYYY-MM-DD` */
  dueDate: string;
  paidOn: string | null;
  autoPaidAt: Date | string | null;
};

/** Whether the job marks this expense paid today. The query in `autoPayDirectDebits` mirrors it. */
export function isAutoPayDue(expense: AutoPayCandidate, today: string): boolean {
  return (
    expense.paymentMethod === "direct_debit" &&
    expense.paidOn === null &&
    expense.autoPaidAt === null &&
    expense.dueDate <= today &&
    expense.dueDate >= addDays(today, -AUTO_PAY_CATCH_UP_DAYS)
  );
}

/** Marks every household's due direct debits paid. Safe to run twice. */
export async function autoPayDirectDebits({
  signal,
  log,
  today = todayIn(),
}: {
  signal?: AbortSignal;
  log?: (message: string) => void;
  today?: string;
}): Promise<{ summary: string; count: number }> {
  const due = await db.expense.findMany({
    where: {
      paymentMethod: "DIRECT_DEBIT",
      paidOn: null,
      autoPaidAt: null,
      dueDate: { lte: toDate(today), gte: toDate(addDays(today, -AUTO_PAY_CATCH_UP_DAYS)) },
    },
    select: { id: true, householdId: true, payee: true, dueDate: true, amountCents: true },
    orderBy: { dueDate: "asc" },
  });

  let count = 0;
  const paidPerHousehold = new Map<string, { payee: string; amountCents: number }[]>();
  const now = new Date();
  for (const expense of due) {
    if (signal?.aborted) break;
    // The guard in `where` keeps a concurrent manual payment or a second run from being overwritten.
    const { count: updated } = await db.expense.updateMany({
      where: { id: expense.id, paidOn: null, autoPaidAt: null },
      data: { paidOn: expense.dueDate, autoPaidAt: now },
    });
    if (updated > 0) {
      count += 1;
      log?.(`${expense.payee} (${expense.dueDate.toISOString().slice(0, 10)}) marked paid`);
      await audit(jobActor(expense.householdId, "expenses.auto-pay"), {
        action: "expense.auto_paid",
        targetType: "expense",
        targetId: expense.id,
        targetLabel: expense.payee,
        summary: `Direct debit due ${formatDate(expense.dueDate.toISOString().slice(0, 10), "en")}`,
      });
      await emitExpenseChanged(expense.householdId, expense.id, "paid");
      paidPerHousehold.set(expense.householdId, [...(paidPerHousehold.get(expense.householdId) ?? []), { payee: expense.payee, amountCents: expense.amountCents }]);
    }
  }
  for (const [householdId, paid] of paidPerHousehold) await notifyAutoPaid(householdId, paid);
  return { summary: count === 0 ? "No direct debits due" : `${count} direct debit${count === 1 ? "" : "s"} marked paid`, count };
}
