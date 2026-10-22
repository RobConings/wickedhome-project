import { EXPENSE_MONTH_END, EXPENSE_RRULE_SUPPORT } from "@/features/expenses/types/expenses";
import {
  baseRuleOf,
  planTotalOpen,
  scaleShares,
  withUntil,
  type InstanceForProgress,
  type TotalOpenPlan,
} from "@/features/expenses/types/total-open";
import { addDays, addMonthsClamped } from "@/types/dates";
import { expandRRule, parseRRule } from "@/types/recurrence";
import { db, type Prisma } from "../lib/db";
import { emitExpenseChanged } from "./expense-events";
import { fromDate, recurringInclude, toDate, type RecurringRow } from "./expense-rows";

/*
 * Recurring expenses: how instances are generated
 * ────────────────────────────────────────────────
 * A RecurringExpense is the template (payee, amount, payment details, payer…) plus an RRULE with
 * `startDate` as DTSTART. Every occurrence is materialised as a real Expense row, so each instance can be
 * paid, edited and deleted on its own, and "this month's total" is a plain query.
 *
 * - Rows exist up to a rolling horizon of GENERATE_AHEAD_MONTHS after today, and never after `endDate`.
 *   `generatedUntil` records how far a template has been materialised.
 * - Creating a recurring expense generates from its start date. Reading the overview (and the calendar,
 *   the dashboard) tops up every ACTIVE template whose `generatedUntil` lies before the horizon.
 * - Generation is idempotent: `@@unique([recurringExpenseId, dueDate])` + `createMany({ skipDuplicates })`.
 *   An instance the user deleted stays deleted, because top-ups only add dates after `generatedUntil`.
 * - Editing a template replaces its unpaid instances due on or after min(today, new start date) and
 *   regenerates them; paid and older instances are history and are never touched.
 * - Pausing or ending removes unpaid instances after today (or the end date) and stops top-ups. Resuming
 *   continues from tomorrow: occurrences while paused are skipped, not made up.
 * - Deleting a template removes its unpaid future instances; past ones keep their data (their
 *   `recurringExpenseId` becomes null).
 * - A template with a total open amount (loans, down payments) generates until the plan of
 *   `types/total-open.ts` has paid it off: existing instances from the as-of date count with their own
 *   amounts, the last generated one gets the partial amount, and the stored UNTIL follows the plan.
 */
export const GENERATE_AHEAD_MONTHS = 12;

export const horizon = (from: string) => addMonthsClamped(from, GENERATE_AHEAD_MONTHS);

/** The columns of one instance: a copy of the template on `dueDate` (shares are added separately). */
export function instanceData(recurring: RecurringRow, dueDate: string, amountCents: number) {
  return {
    householdId: recurring.householdId,
    recurringExpenseId: recurring.id,
    payee: recurring.payee,
    description: recurring.description,
    amountCents,
    dueDate: toDate(dueDate),
    category: recurring.category,
    paymentMethod: recurring.paymentMethod,
    beneficiaryName: recurring.beneficiaryName,
    iban: recurring.iban,
    bic: recurring.bic,
    structuredCommunication: recurring.structuredCommunication,
    reference: recurring.reference,
    payerType: recurring.payerType,
    payerHabitantId: recurring.payerHabitantId,
    notes: recurring.notes,
    paymentAccountId: recurring.paymentAccountId,
    projectId: recurring.projectId,
  };
}

/**
 * Materialises the template's occurrences in [from, to] (capped at its end date) as expenses. Idempotent.
 * Returns the ids of the expenses it created (for `emitExpenseChanged`, after the transaction commits).
 */
export async function generateInstances(
  tx: Prisma.TransactionClient,
  recurring: RecurringRow,
  from: string,
  to: string,
): Promise<string[]> {
  const end = recurring.endDate ? fromDate(recurring.endDate) : null;
  let until = end && end < to ? end : to;
  const plan = await totalOpenPlanFor(tx, recurring, from);
  // With a total open amount the plan decides where the series stops (and keeps the stored UNTIL in step).
  if (plan) {
    const last = plan.lastDate;
    until = !last ? addDays(from, -1) : last < until ? last : until;
  }
  const rule = plan ? baseRuleOf(recurring.rrule) : parseRRule(recurring.rrule, EXPENSE_RRULE_SUPPORT);
  const dates =
    rule && from <= until
      ? expandRRule(rule, fromDate(recurring.startDate), { from, to: until, limit: 500, monthEnd: EXPENSE_MONTH_END })
      : [];
  const amountOn = new Map(plan?.payments.map((payment) => [payment.dueDate, payment.amountCents]));
  let createdIds: string[] = [];

  if (dates.length > 0) {
    const existing = await tx.expense.findMany({
      where: { recurringExpenseId: recurring.id, dueDate: { in: dates.map(toDate) } },
      select: { id: true },
    });
    await tx.expense.createMany({
      data: dates.map((dueDate) => instanceData(recurring, dueDate, amountOn.get(dueDate) ?? recurring.amountCents)),
      skipDuplicates: true,
    });
    const known = new Set(existing.map((row) => row.id));
    const all = await tx.expense.findMany({
      where: { recurringExpenseId: recurring.id, dueDate: { in: dates.map(toDate) } },
      select: { id: true },
    });
    createdIds = all.map((row) => row.id).filter((id) => !known.has(id));

    if (recurring.payerType === "SPLIT" && recurring.shares.length > 0) {
      const created = await tx.expense.findMany({
        where: { recurringExpenseId: recurring.id, dueDate: { in: dates.map(toDate) }, paidOn: null, shares: { none: {} } },
        select: { id: true, amountCents: true },
      });
      await tx.expenseShare.createMany({
        // A partial last payment of a loan gets the shares scaled to its amount.
        data: created.flatMap((expense) =>
          scaleShares(recurring.shares, recurring.amountCents, expense.amountCents).map((share) => ({
            expenseId: expense.id,
            habitantId: share.habitantId,
            amountCents: share.amountCents,
          })),
        ),
        skipDuplicates: true,
      });
    }
  }

  // Keep the stored end of a loan in step with its plan, so every reader of the RRULE stops there too.
  const rrule = plan ? withUntil(recurring.rrule, plan.lastDate) : recurring.rrule;
  await tx.recurringExpense.update({
    where: { id: recurring.id },
    data: { generatedUntil: toDate(to), ...(rrule !== recurring.rrule && { rrule }) },
  });
  return createdIds;
}

/**
 * The plan of a template with a total open amount for generating from `from` on: the instances that exist
 * (due on or after the as-of date) are settled with their own amounts. `null` without a total open amount.
 */
async function totalOpenPlanFor(tx: Prisma.TransactionClient, recurring: RecurringRow, from: string): Promise<TotalOpenPlan | null> {
  if (!recurring.totalOpenCents || !recurring.totalOpenAsOf) return null;
  const asOf = fromDate(recurring.totalOpenAsOf);
  const settled = await tx.expense.findMany({
    where: { recurringExpenseId: recurring.id, dueDate: { gte: recurring.totalOpenAsOf } },
    select: { dueDate: true, amountCents: true },
  });
  return planTotalOpen({
    amountCents: recurring.amountCents,
    totalOpenCents: recurring.totalOpenCents,
    asOf,
    rrule: recurring.rrule,
    startDate: fromDate(recurring.startDate),
    from,
    settled: settled.map((row) => ({ dueDate: fromDate(row.dueDate), amountCents: row.amountCents })),
  });
}

/**
 * Instances (due date, amount, paid) of the templates that have a total open amount, for their progress
 * (`toRecurring(row, today, instances)`). One query for all of them.
 */
export async function loadInstancesForProgress(
  rows: readonly Pick<RecurringRow, "id" | "totalOpenCents" | "totalOpenAsOf">[],
): Promise<Map<string, InstanceForProgress[]>> {
  const loans = rows.filter((row) => row.totalOpenCents && row.totalOpenAsOf);
  const result = new Map<string, InstanceForProgress[]>(loans.map((row) => [row.id, []]));
  if (loans.length === 0) return result;
  const instances = await db.expense.findMany({
    where: { recurringExpenseId: { in: loans.map((row) => row.id) } },
    select: { recurringExpenseId: true, dueDate: true, amountCents: true, paidOn: true },
  });
  for (const instance of instances) {
    if (!instance.recurringExpenseId) continue;
    result.get(instance.recurringExpenseId)?.push({
      dueDate: fromDate(instance.dueDate),
      amountCents: instance.amountCents,
      paid: instance.paidOn !== null,
    });
  }
  return result;
}

/**
 * Tops up every active template of the household to the rolling horizon. Cheap when there is nothing to do.
 * Announces the new instances (`expense-events`).
 */
export async function topUpRecurring(householdId: string, today: string) {
  const until = horizon(today);
  const stale = await db.recurringExpense.findMany({
    where: { householdId, status: "ACTIVE", OR: [{ generatedUntil: null }, { generatedUntil: { lt: toDate(until) } }] },
    include: recurringInclude,
  });
  for (const recurring of stale) {
    // Occurrences up to `generatedUntil` already have rows; continue the day after.
    const from = recurring.generatedUntil ? addDays(fromDate(recurring.generatedUntil), 1) : fromDate(recurring.startDate);
    const created = await db.$transaction((tx) => generateInstances(tx, recurring, from, until));
    await emitExpenseChanged(householdId, created, "created");
  }
}
