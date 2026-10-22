import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import { expenseStatus } from "@/features/expenses/types/expense-calculations";
import { EXPENSE_MONTH_END, EXPENSE_RRULE_SUPPORT } from "@/features/expenses/types/expenses";
import { baseRuleOf, planTotalOpen, type DatedAmount } from "@/features/expenses/types/total-open";
import { addDays, todayIn } from "@/types/dates";
import { expandRRule, parseRRule } from "@/types/recurrence";
import type { CalendarSource } from "../calendar/calendar-sources";
import { db } from "../lib/db";
import { loadInstancesForProgress, topUpRecurring } from "./expense-instances";
import { fromDate, toDate } from "./expense-rows";

/** `12345` → `€ 123,45` (nl-BE, as the household reads it; titles are not translated per user). */
const euros = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

type ExpenseForCalendar = {
  id: string;
  payee: string;
  amountCents: number;
  dueDate: string;
  paidOn: string | null;
  payerHabitantId: string | null;
  shares: { habitantId: string }[];
};

/** One read-only all-day item per expense on its due date: "Fluvius · € 123,45", with its status in `meta`. */
export function expenseCalendarItems(expenses: ExpenseForCalendar[], today: string): CalendarOverlayItem[] {
  return expenses.map((expense) => {
    const status = expenseStatus(expense, today);
    return {
      id: expense.id,
      kind: "bill",
      title: `${expense.payee} · ${euros.format(expense.amountCents / 100)}`,
      allDay: true,
      start: expense.dueDate,
      participantIds: expense.payerHabitantId ? [expense.payerHabitantId] : expense.shares.map((share) => share.habitantId),
      // Unpaid in the bill colour, overdue in red, paid muted.
      color: status === "paid" ? "#9ca3af" : status === "overdue" ? "#dc2626" : null,
      href: `/expenses/${encodeURIComponent(expense.id)}`,
      meta: { status, amountCents: expense.amountCents },
    };
  });
}

type RecurringForCalendar = {
  id: string;
  payee: string;
  amountCents: number;
  rrule: string;
  startDate: string;
  endDate: string | null;
  /** Occurrences up to this date have rows (or were deleted on purpose); later ones are computed. */
  generatedUntil: string | null;
  payerHabitantId: string | null;
  shares: { habitantId: string }[];
  /**
   * Loans with a total open amount: the existing instances from the as-of date on (`settled`). Occurrences
   * then stop after the last payment, which shows its partial amount.
   */
  totalOpen?: { totalOpenCents: number; asOf: string; settled: DatedAmount[] } | null;
};

/** Due dates and amounts of a template's occurrences in [from, to] that have no row (yet). */
export function virtualOccurrences(item: Omit<RecurringForCalendar, "payee" | "payerHabitantId" | "shares" | "id">, from: string, to: string): DatedAmount[] {
  const afterHorizon = item.generatedUntil ? addDays(item.generatedUntil, 1) : item.startDate;
  const start = afterHorizon > from ? afterHorizon : from;
  const end = item.endDate && item.endDate < to ? item.endDate : to;
  if (start > end) return [];
  if (item.totalOpen) {
    const plan = planTotalOpen({
      amountCents: item.amountCents,
      totalOpenCents: item.totalOpen.totalOpenCents,
      asOf: item.totalOpen.asOf,
      rrule: item.rrule,
      startDate: item.startDate,
      from: afterHorizon,
      settled: item.totalOpen.settled,
    });
    const last = plan.lastDate ?? addDays(start, -1);
    const amounts = new Map(plan.payments.map((payment) => [payment.dueDate, payment.amountCents]));
    const rule = baseRuleOf(item.rrule);
    if (!rule) return [];
    return expandRRule(rule, item.startDate, { from: start, to: last < end ? last : end, limit: 400, monthEnd: EXPENSE_MONTH_END }).map(
      (dueDate) => ({ dueDate, amountCents: amounts.get(dueDate) ?? item.amountCents }),
    );
  }
  const rule = parseRRule(item.rrule, EXPENSE_RRULE_SUPPORT);
  if (!rule) return [];
  return expandRRule(rule, item.startDate, { from: start, to: end, limit: 400, monthEnd: EXPENSE_MONTH_END }).map((dueDate) => ({
    dueDate,
    amountCents: item.amountCents,
  }));
}

/**
 * What a template still adds beyond its materialised instances in [from, to]: its virtual occurrences when it
 * is active; nothing when paused (no instances until it is resumed) or ended.
 */
export function projectedOccurrences(
  item: Parameters<typeof virtualOccurrences>[0] & { status: "ACTIVE" | "PAUSED" | "ENDED" },
  from: string,
  to: string,
): DatedAmount[] {
  return item.status === "ACTIVE" ? virtualOccurrences(item, from, to) : [];
}

/**
 * Occurrences of active recurring expenses after their generation horizon (`generatedUntil`) within
 * [from, to], as read-only items linking to the recurring expense. Before the horizon the materialised
 * expenses are shown instead, so nothing appears twice (and a deleted instance stays deleted).
 */
export function virtualRecurringItems(recurring: RecurringForCalendar[], from: string, to: string, today: string): CalendarOverlayItem[] {
  return recurring.flatMap((item) =>
    expenseCalendarItems(
      virtualOccurrences(item, from, to).map(({ dueDate, amountCents }) => ({
        ...item,
        id: `recurring:${item.id}:${dueDate}`,
        amountCents,
        dueDate,
        paidOn: null,
      })),
      today,
    ).map((entry) => ({ ...entry, href: `/expenses/recurring/${encodeURIComponent(item.id)}` })),
  );
}

/**
 * Calendar source `expenses`: every expense due in the range (paid ones muted), plus the computed
 * occurrences of active recurring expenses beyond the materialised horizon, for any range.
 */
export const expensesCalendarSource: CalendarSource = {
  id: "expenses",
  async load({ householdId, from, to }) {
    const today = todayIn();
    await topUpRecurring(householdId, today);
    const recurringRows = await db.recurringExpense.findMany({
      where: { householdId, status: "ACTIVE" },
      select: {
        id: true,
        payee: true,
        amountCents: true,
        rrule: true,
        startDate: true,
        endDate: true,
        generatedUntil: true,
        totalOpenCents: true,
        totalOpenAsOf: true,
        payerType: true,
        payerHabitantId: true,
        shares: { select: { habitantId: true } },
      },
    });
    const loanInstances = await loadInstancesForProgress(recurringRows);
    const virtual = virtualRecurringItems(
      recurringRows.map((row) => ({
        id: row.id,
        payee: row.payee,
        amountCents: row.amountCents,
        rrule: row.rrule,
        startDate: fromDate(row.startDate),
        endDate: row.endDate ? fromDate(row.endDate) : null,
        generatedUntil: row.generatedUntil ? fromDate(row.generatedUntil) : null,
        payerHabitantId: row.payerType === "PERSON" ? row.payerHabitantId : null,
        shares: row.payerType === "SPLIT" ? row.shares : [],
        totalOpen:
          row.totalOpenCents && row.totalOpenAsOf
            ? { totalOpenCents: row.totalOpenCents, asOf: fromDate(row.totalOpenAsOf), settled: loanInstances.get(row.id) ?? [] }
            : null,
      })),
      from,
      to,
      today,
    );
    const rows = await db.expense.findMany({
      where: { householdId, dueDate: { gte: toDate(from), lte: toDate(to) } },
      select: {
        id: true,
        payee: true,
        amountCents: true,
        dueDate: true,
        paidOn: true,
        payerType: true,
        payerHabitantId: true,
        shares: { select: { habitantId: true } },
      },
      orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
    });
    const materialised = expenseCalendarItems(
      rows.map((row) => ({
        id: row.id,
        payee: row.payee,
        amountCents: row.amountCents,
        dueDate: fromDate(row.dueDate),
        paidOn: row.paidOn ? fromDate(row.paidOn) : null,
        payerHabitantId: row.payerType === "PERSON" ? row.payerHabitantId : null,
        shares: row.payerType === "SPLIT" ? row.shares : [],
      })),
      today,
    );
    return [...materialised, ...virtual];
  },
};
