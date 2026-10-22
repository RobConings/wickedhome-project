import { addDays, addMonthsClamped, monthOf } from "@/types/dates";
import { parseRRule } from "@/types/recurrence";
import {
  DUE_SOON_DAYS,
  EXPENSE_RRULE_SUPPORT,
  type Expense,
  type ExpenseShare,
  type ExpenseStatus,
  type ExpenseTotals,
  type ExpensePeriodTotal,
  type PayerType,
  type RecurringExpense,
  type RecurringTotals,
} from "./expenses";

/** Pure calculations on expenses, shared by the API and the screens. */

export function expenseStatus(expense: { dueDate: string; paidOn: string | null }, today: string): ExpenseStatus {
  if (expense.paidOn) return "paid";
  if (expense.dueDate < today) return "overdue";
  if (expense.dueDate <= addDays(today, DUE_SOON_DAYS)) return "due";
  return "upcoming";
}

/** Totals for this month, next month and everything overdue. */
export function computeExpenseTotals(
  expenses: Pick<Expense, "amountCents" | "dueDate" | "paidOn">[],
  today: string,
): ExpenseTotals {
  const thisMonth = monthOf(today);
  const nextMonth = monthOf(addMonthsClamped(`${thisMonth}-01`, 1));
  const empty = (): ExpensePeriodTotal => ({ totalCents: 0, unpaidCents: 0, count: 0 });
  const totals: ExpenseTotals = { thisMonth: empty(), nextMonth: empty(), overdue: { totalCents: 0, count: 0 } };

  for (const expense of expenses) {
    const month = monthOf(expense.dueDate);
    const period = month === thisMonth ? totals.thisMonth : month === nextMonth ? totals.nextMonth : null;
    if (period) {
      period.totalCents += expense.amountCents;
      period.count += 1;
      if (!expense.paidOn) period.unpaidCents += expense.amountCents;
    }
    if (expenseStatus(expense, today) === "overdue") {
      totals.overdue.totalCents += expense.amountCents;
      totals.overdue.count += 1;
    }
  }
  return totals;
}

/** Splits a total equally, cent-exact: leftover cents go to the first habitants, so the shares always add up. */
export function splitEqually(totalCents: number, habitantIds: string[]): ExpenseShare[] {
  if (habitantIds.length === 0) return [];
  const base = Math.floor(totalCents / habitantIds.length);
  const remainder = totalCents - base * habitantIds.length;
  return habitantIds.map((habitantId, index) => ({ habitantId, amountCents: base + (index < remainder ? 1 : 0) }));
}

/** Whether shares are what an equal split gives (used to pre-select "equal" when editing). */
export function isEqualSplit(totalCents: number, shares: ExpenseShare[]): boolean {
  if (shares.length === 0) return false;
  const amounts = shares.map((share) => share.amountCents);
  const sum = amounts.reduce((total, amount) => total + amount, 0);
  // Order-independent: an equal split differs by at most one cent between habitants.
  return sum === totalCents && Math.max(...amounts) - Math.min(...amounts) <= 1;
}

/** How many times a year an RRULE occurs (weeks count as 52 a year); 0 when it can't be read. */
export function occurrencesPerYear(rrule: string): number {
  const rule = parseRRule(rrule, EXPENSE_RRULE_SUPPORT);
  if (!rule) return 0;
  const interval = Math.max(1, rule.interval);
  switch (rule.freq) {
    case "WEEKLY":
      return 52 / interval;
    case "MONTHLY":
      return 12 / interval;
    case "YEARLY":
      return 1 / interval;
    default:
      return 0;
  }
}

/** Exact (unrounded) yearly cost in cents; round only when displaying or after summing. */
export const exactYearlyCents = (amountCents: number, rrule: string) => amountCents * occurrencesPerYear(rrule);

export function computeRecurringTotals(
  recurring: Pick<RecurringExpense, "status" | "amountCents" | "rrule" | "candidateToCancel">[],
): RecurringTotals {
  let yearly = 0;
  let candidates = 0;
  let activeCount = 0;
  let candidatesCount = 0;
  for (const item of recurring) {
    if (item.status !== "active") continue;
    const cost = exactYearlyCents(item.amountCents, item.rrule);
    yearly += cost;
    activeCount += 1;
    if (item.candidateToCancel) {
      candidates += cost;
      candidatesCount += 1;
    }
  }
  return {
    monthlyCents: Math.round(yearly / 12),
    yearlyCents: Math.round(yearly),
    activeCount,
    candidatesYearlyCents: Math.round(candidates),
    candidatesCount,
  };
}

// ── Who pays ────────────────────────────────────────────────────────────────────────────────────────

/** Filter of the Upcoming and History views: everything, the joint account, or one habitant. */
export type PayerFilter = "all" | "joint" | { habitantId: string };

type PayerOf = { payerType: PayerType; payerHabitantId: string | null; shares: ExpenseShare[]; amountCents: number };

/** What `habitantId` pays of an expense: all of it as payer, their share in a split, else nothing. */
export function amountFor(expense: PayerOf, habitantId: string): number {
  if (expense.payerType === "person") return expense.payerHabitantId === habitantId ? expense.amountCents : 0;
  if (expense.payerType === "split") return expense.shares.find((share) => share.habitantId === habitantId)?.amountCents ?? 0;
  return 0;
}

/** Whether an expense concerns the filter: joint ones for "joint", a person's own and split ones for a person. */
export function matchesPayer(expense: PayerOf, filter: PayerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "joint") return expense.payerType === "joint";
  return amountFor(expense, filter.habitantId) > 0 || (expense.payerType === "person" && expense.payerHabitantId === filter.habitantId);
}

type VoucherExpense = PayerOf & { paymentMethod: string | null; paidOn: string | null; paidById?: string | null };

/**
 * Who paid how much with meal vouchers, and when (voucher balance, docs/FINANCE.md): for every paid expense
 * with payment method "meal_voucher", the payer's whole amount, or each habitant's share of a split. Vouchers
 * belong to a person, so new expenses can't be joint and paid with vouchers (`checkPayment`); an older joint
 * one counts for whoever marked it paid (`paidById`), else for nobody.
 */
export function mealVoucherPortions(expenses: readonly VoucherExpense[]): { habitantId: string; amountCents: number; date: string }[] {
  return expenses.flatMap((expense) => {
    const date = expense.paidOn;
    if (expense.paymentMethod !== "meal_voucher" || !date) return [];
    if (expense.payerType === "person" && expense.payerHabitantId) {
      return [{ habitantId: expense.payerHabitantId, amountCents: expense.amountCents, date }];
    }
    if (expense.payerType === "split") return expense.shares.map((share) => ({ habitantId: share.habitantId, amountCents: share.amountCents, date }));
    if (expense.payerType === "joint" && expense.paidById) return [{ habitantId: expense.paidById, amountCents: expense.amountCents, date }];
    return [];
  });
}

/**
 * The next unpaid expense for the joint account and for each habitant (theirs or their share of a split),
 * soonest first. Expects unpaid expenses sorted by due date.
 */
export function nextPerPayer<T extends PayerOf & { dueDate: string }>(
  unpaid: readonly T[],
  habitantIds: readonly string[],
): { joint: T | null; byHabitant: Record<string, T | null> } {
  const joint = unpaid.find((expense) => expense.payerType === "joint") ?? null;
  const byHabitant = Object.fromEntries(
    habitantIds.map((id) => [id, unpaid.find((expense) => matchesPayer(expense, { habitantId: id })) ?? null]),
  );
  return { joint, byHabitant };
}
