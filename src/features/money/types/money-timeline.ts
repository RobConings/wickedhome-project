import { addMonthsClamped, monthOf } from "@/types/dates";
import type { MoneyLoans, TimelineMonth } from "./money";

/*
 * Income and expenses per month, past and future. Pure: the money API feeds it what the income and expenses
 * features list (`listIncomeFlow`, `listExpenseFlow`); nothing is stored.
 *
 * - Past months: what came in (received incomes) and what was paid (on its payment date).
 * - The current month: that, plus what is still expected this month (fixed incomes, estimates of variable
 *   ones, unpaid expenses due this month) and unpaid expenses from earlier months (overdue: still to pay now).
 * - Future months: projected from recurring incomes and every unpaid or computed expense occurrence, so a
 *   loan's partial last payment and its end show as the expenses stepping down.
 */

export type TimelineIncome = { date: string; amountCents: number; received: boolean; estimate: boolean };
export type TimelineExpense = { date: string; amountCents: number; paid: boolean; recurring: boolean; kind: string | null };

const LOAN_KINDS = new Set(["loan", "down_payment"]);

/** `YYYY-MM` months from `from` to `to`, inclusive (empty when `to` is before `from`). */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < 1200; month = monthOf(addMonthsClamped(`${month}-01`, 1))) months.push(month);
  return months;
}

export function buildMoneyTimeline({
  from,
  to,
  today,
  incomes,
  expenses,
}: {
  /** `YYYY-MM` */
  from: string;
  to: string;
  /** `YYYY-MM-DD` */
  today: string;
  incomes: readonly TimelineIncome[];
  expenses: readonly TimelineExpense[];
}): TimelineMonth[] {
  const current = monthOf(today);
  const months = new Map<string, TimelineMonth>(
    monthsBetween(from, to).map((month) => [
      month,
      {
        month,
        period: month < current ? "past" : month === current ? "current" : "future",
        incomeCents: 0,
        incomeEstimateCents: 0,
        expenseCents: 0,
        loansCents: 0,
        recurringCents: 0,
        oneOffCents: 0,
        netCents: 0,
      },
    ]),
  );

  for (const income of incomes) {
    const month = monthOf(income.date);
    // Expected income only counts from the current month on; the past shows what really came in.
    if (!income.received && month < current) continue;
    const row = months.get(month);
    if (!row) continue;
    row.incomeCents += income.amountCents;
    if (!income.received && income.estimate) row.incomeEstimateCents += income.amountCents;
  }

  for (const expense of expenses) {
    let month = monthOf(expense.date);
    // Unpaid from an earlier month: overdue, so still to pay now.
    if (!expense.paid && month < current) month = current;
    const row = months.get(month);
    if (!row) continue;
    row.expenseCents += expense.amountCents;
    if (expense.kind && LOAN_KINDS.has(expense.kind)) row.loansCents += expense.amountCents;
    else if (expense.recurring) row.recurringCents += expense.amountCents;
    else row.oneOffCents += expense.amountCents;
  }

  return [...months.values()].map((row) => ({ ...row, netCents: row.incomeCents - row.expenseCents }));
}

/** Totals of the loans card: open, total and repaid over the loans with a total open amount, and the monthly cost. */
export function loanTotals(loans: MoneyLoans["loans"]): MoneyLoans["totals"] {
  const tracked = loans.flatMap((loan) => (loan.totalOpen ? [loan.totalOpen] : []));
  return {
    remainingCents: tracked.reduce((sum, progress) => sum + progress.remainingCents, 0),
    totalCents: tracked.reduce((sum, progress) => sum + progress.totalCents, 0),
    repaidCents: tracked.reduce((sum, progress) => sum + progress.paidCents, 0),
    monthlyCents: loans.filter((loan) => loan.status === "active").reduce((sum, loan) => sum + loan.monthlyCents, 0),
    trackedCount: tracked.length,
  };
}
