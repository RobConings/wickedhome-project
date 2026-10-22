import { computeExpenseTotals, computeRecurringTotals, mealVoucherPortions } from "@/features/expenses/types/expense-calculations";
import {
  DUE_SOON_DAYS,
  EXPENSE_MONTH_END,
  EXPENSE_RRULE_SUPPORT,
  type Expense,
  type ExpenseCreateInput,
  type ExpenseDetail,
  type ExpenseFlowItem,
  type ExpenseInput,
  type LoanSummary,
  type ExpensePaymentInput,
  type ExpensesOverview,
  type ExpensesSummary,
  type PayeeSuggestion,
  type RecurringExpense,
  type RecurringExpenseDetail,
  type RecurringExpenseInput,
  type RecurringStatusInput,
} from "@/features/expenses/types/expenses";
import { normalizeIban, normalizeStructuredCommunication } from "@/features/expenses/types/payment-references";
import { baseRuleOf, planTotalOpen, scaleShares, withUntil } from "@/features/expenses/types/total-open";
import { addDays, addMonthsClamped, todayIn } from "@/types/dates";
import { expandRRule, nextOccurrence, parseRRule } from "@/types/recurrence";
import { forgetDocumentLinks, moveDocumentLinks } from "../documents/documents.service";
import { db, type Prisma } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { emitExpenseChanged } from "./expense-events";
import { generateInstances, horizon, instanceData, loadInstancesForProgress, topUpRecurring } from "./expense-instances";
import { projectedOccurrences, virtualOccurrences } from "./expenses.calendar";
import {
  expenseInclude,
  fromDate,
  fromStatus,
  paymentData,
  recurringData,
  recurringInclude,
  sharesCreate,
  toCategory,
  toDate,
  toExpense,
  toKind,
  toMethod,
  toRecurring,
} from "./expense-rows";

/** Documents attach to expenses under the entity type "bill" (the table's original name; existing links keep working). */
export const EXPENSE_DOCUMENT_TYPE = "bill" as const;

/** Paid expenses older than this are left out of the overview (they stay in each expense's history). */
const PAID_HISTORY_MONTHS = 12;
const HISTORY_LIMIT = 24;
/** How far ahead the dashboard's "upcoming" looks. */
const SUMMARY_DAYS = 14;

const today = () => todayIn();

/** Every habitant id must belong to the household; otherwise it's a validation error on `field`. */
async function assertOwnHabitants(householdId: string, ids: (string | null | undefined)[], field: string) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;
  const found = await db.habitant.count({ where: { householdId, id: { in: unique } } });
  if (found !== unique.length) throw badRequest("Validation failed", { [field]: ["Unknown habitant"] });
}

async function assertPayer(householdId: string, input: Pick<ExpenseInput, "payerHabitantId" | "shares" | "projectId">) {
  await assertOwnHabitants(householdId, [input.payerHabitantId], "payerHabitantId");
  await assertOwnHabitants(householdId, input.shares.map((share) => share.habitantId), "shares");
  // The project (projects feature) must be the household's own.
  if (input.projectId) {
    const found = await db.project.count({ where: { id: input.projectId, householdId } });
    if (!found) throw badRequest("Validation failed", { projectId: ["Unknown project"] });
  }
}

/** A shop of the household or of the built-in catalogue. */
async function assertShop(householdId: string, shopId: string | null | undefined) {
  if (!shopId) return;
  const found = await db.shop.count({ where: { id: shopId, OR: [{ householdId }, { householdId: null }] } });
  if (!found) throw badRequest("Validation failed", { shopId: ["Unknown shop"] });
}

/** Loads an expense, scoped to the household so ids from other households 404. */
async function findOwnExpense(householdId: string, id: string) {
  const row = await db.expense.findFirst({ where: { id, householdId }, include: expenseInclude });
  if (!row) throw notFound("Expense not found");
  return row;
}

async function findOwnRecurring(householdId: string, id: string) {
  const row = await db.recurringExpense.findFirst({ where: { id, householdId }, include: recurringInclude });
  if (!row) throw notFound("Recurring expense not found");
  return row;
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────────────

export async function getExpensesOverview(householdId: string): Promise<ExpensesOverview> {
  const now = today();
  await topUpRecurring(householdId, now);

  const paidSince = toDate(addMonthsClamped(now, -PAID_HISTORY_MONTHS));
  const [expenseRows, recurringRows, payeeRows] = await Promise.all([
    db.expense.findMany({
      where: { householdId, OR: [{ paidOn: null }, { paidOn: { gte: paidSince } }] },
      include: expenseInclude,
      orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
    }),
    db.recurringExpense.findMany({ where: { householdId }, include: recurringInclude, orderBy: { payee: "asc" } }),
    // Latest expense per payee: its category and payment details prefill the form when the payee is picked again.
    db.expense.findMany({
      where: { householdId },
      distinct: ["payee"],
      orderBy: [{ payee: "asc" }, { dueDate: "desc" }],
      select: { payee: true, category: true, paymentMethod: true, beneficiaryName: true, iban: true, bic: true, dueDate: true },
    }),
  ]);

  const expenses = expenseRows.map((row) => toExpense(row, now));
  const loanInstances = await loadInstancesForProgress(recurringRows);
  const recurring = recurringRows.map((row) => toRecurring(row, now, loanInstances.get(row.id)));
  const payees: PayeeSuggestion[] = payeeRows
    .map((row) => ({
      name: row.payee,
      category: toCategory(row.category),
      paymentMethod: toMethod(row.paymentMethod),
      beneficiaryName: row.beneficiaryName,
      iban: row.iban,
      bic: row.bic,
      lastUsedOn: fromDate(row.dueDate),
    }))
    .sort((a, b) => b.lastUsedOn.localeCompare(a.lastUsedOn));

  return {
    today: now,
    expenses,
    recurring,
    payees,
    totals: computeExpenseTotals(expenses, now),
    recurringTotals: computeRecurringTotals(recurring),
  };
}

/** The dashboard's figures: unpaid expenses up to two weeks ahead (overdue included) and the recurring totals. */
export async function getExpensesSummary(householdId: string): Promise<ExpensesSummary> {
  const now = today();
  await topUpRecurring(householdId, now);
  const [unpaidRows, recurringRows] = await Promise.all([
    db.expense.findMany({
      where: { householdId, paidOn: null, dueDate: { lte: toDate(addDays(now, SUMMARY_DAYS)) } },
      include: expenseInclude,
      orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
    }),
    db.recurringExpense.findMany({ where: { householdId }, include: recurringInclude }),
  ]);
  const upcoming = unpaidRows.map((row) => toExpense(row, now));
  const sum = (list: Expense[]) => ({ count: list.length, totalCents: list.reduce((total, item) => total + item.amountCents, 0) });
  const weekEnd = addDays(now, DUE_SOON_DAYS);
  return {
    today: now,
    upcoming,
    dueThisWeek: sum(upcoming.filter((expense) => expense.dueDate >= now && expense.dueDate <= weekEnd)),
    overdue: sum(upcoming.filter((expense) => expense.status === "overdue")),
    recurring: computeRecurringTotals(recurringRows.map((row) => toRecurring(row, now))),
  };
}

export async function getExpenseDetail(householdId: string, id: string): Promise<ExpenseDetail> {
  const now = today();
  const row = await findOwnExpense(householdId, id);
  const [recurringRow, historyRows] = await Promise.all([
    row.recurringExpenseId
      ? db.recurringExpense.findFirst({ where: { id: row.recurringExpenseId, householdId }, include: recurringInclude })
      : null,
    db.expense.findMany({
      where: {
        householdId,
        id: { not: row.id },
        dueDate: { lte: toDate(now) },
        ...(row.recurringExpenseId ? { recurringExpenseId: row.recurringExpenseId } : { payee: row.payee }),
      },
      include: expenseInclude,
      orderBy: { dueDate: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);
  const loanInstances = await loadInstancesForProgress(recurringRow ? [recurringRow] : []);
  return {
    today: now,
    expense: toExpense(row, now),
    recurring: recurringRow ? toRecurring(recurringRow, now, loanInstances.get(recurringRow.id)) : null,
    history: historyRows.map((history) => toExpense(history, now)),
  };
}

export async function getRecurringExpenseDetail(householdId: string, id: string): Promise<RecurringExpenseDetail> {
  const now = today();
  await topUpRecurring(householdId, now);
  const row = await findOwnRecurring(householdId, id);
  const [upcomingRows, historyRows] = await Promise.all([
    db.expense.findMany({
      where: { householdId, recurringExpenseId: id, paidOn: null },
      include: expenseInclude,
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.expense.findMany({
      where: { householdId, recurringExpenseId: id, NOT: { paidOn: null } },
      include: expenseInclude,
      orderBy: { dueDate: "desc" },
      take: HISTORY_LIMIT,
    }),
  ]);
  const loanInstances = await loadInstancesForProgress([row]);
  return {
    today: now,
    recurring: toRecurring(row, now, loanInstances.get(row.id)),
    upcoming: upcomingRows.map((expense) => toExpense(expense, now)),
    history: historyRows.map((expense) => toExpense(expense, now)),
  };
}

/** The recurring expense a subscription was migrated to (old `/subscriptions/:id` links), or `null`. */
export async function findRecurringForSubscription(householdId: string, subscriptionId: string): Promise<{ id: string } | null> {
  return db.recurringExpense.findFirst({ where: { householdId, legacySubscriptionId: subscriptionId }, select: { id: true } });
}

/** An unpaid expense someone has to pay by hand (everything but a direct debit). */
export type ManualPayment = Pick<
  Expense,
  "id" | "payee" | "amountCents" | "dueDate" | "paymentMethod" | "payerType" | "payerHabitantId" | "shares" | "recurringExpenseId"
>;

/**
 * Unpaid expenses due in [from, to] (inclusive, `YYYY-MM-DD`) that are paid by hand: every payment method
 * except DIRECT_DEBIT, including "not set". For other features, e.g. the tasks feature creating a
 * "Pay …" task the day before; they mark the expense paid with `markExpensePaid` / `markExpenseUnpaid`.
 * Recurring expenses are topped up first, so instances within the generation horizon exist.
 */
export async function listUnpaidManualPayments(householdId: string, from: string, to: string): Promise<ManualPayment[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const rows = await db.expense.findMany({
    where: {
      householdId,
      paidOn: null,
      dueDate: { gte: toDate(from), lte: toDate(to) },
      OR: [{ paymentMethod: null }, { paymentMethod: { not: "DIRECT_DEBIT" } }],
    },
    include: expenseInclude,
    orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
  });
  return rows.map((row) => {
    const expense = toExpense(row, now);
    return {
      id: expense.id,
      payee: expense.payee,
      amountCents: expense.amountCents,
      dueDate: expense.dueDate,
      paymentMethod: expense.paymentMethod,
      payerType: expense.payerType,
      payerHabitantId: expense.payerHabitantId,
      shares: expense.shares,
      recurringExpenseId: expense.recurringExpenseId,
    };
  });
}

// ── For the money and income features (Finance phase 2) ────────────────────────────────────────────

/** A paid joint expense as it affects a joint account's balance. */
export type JointPayment = {
  id: string;
  payee: string;
  amountCents: number;
  /** `YYYY-MM-DD` */
  paidOn: string;
  /** The account it was paid from, when set; otherwise the household's default joint account applies. */
  paymentAccountId: string | null;
  /** When the row last changed (ISO), as "when it was marked paid": orders it against a correction of the same day. */
  recordedAt: string;
};

/**
 * Paid expenses with payer JOINT, paid on or after `since` (when given), except those paid with meal
 * vouchers (not money from the bank). The money feature computes joint account balances from them, so an
 * expense that is marked unpaid again simply stops counting.
 */
export async function listJointPayments(householdId: string, since?: string | null): Promise<JointPayment[]> {
  const rows = await db.expense.findMany({
    where: {
      householdId,
      payerType: "JOINT",
      paidOn: since ? { gte: toDate(since) } : { not: null },
      OR: [{ paymentMethod: null }, { paymentMethod: { not: "MEAL_VOUCHER" } }],
    },
    select: { id: true, payee: true, amountCents: true, paidOn: true, paymentAccountId: true, updatedAt: true },
    orderBy: [{ paidOn: "asc" }, { payee: "asc" }],
  });
  return rows.flatMap((row) =>
    row.paidOn
      ? [
          {
            id: row.id,
            payee: row.payee,
            amountCents: row.amountCents,
            paidOn: fromDate(row.paidOn),
            paymentAccountId: row.paymentAccountId,
            recordedAt: row.updatedAt.toISOString(),
          },
        ]
      : [],
  );
}

/** Expenses due in [from, to] or paid in it (inclusive, `YYYY-MM-DD`), soonest first. */
export async function listExpensesBetween(householdId: string, from: string, to: string): Promise<Expense[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const range = { gte: toDate(from), lte: toDate(to) };
  const rows = await db.expense.findMany({
    where: { householdId, OR: [{ dueDate: range }, { paidOn: range }] },
    include: expenseInclude,
    orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
  });
  return rows.map((row) => toExpense(row, now));
}

/** Unpaid expenses due up to `until` (overdue ones included), soonest first: for "Next to pay". */
export async function listUnpaidExpenses(householdId: string, until: string): Promise<Expense[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const rows = await db.expense.findMany({
    where: { householdId, paidOn: null, dueDate: { lte: toDate(until) } },
    include: expenseInclude,
    orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
  });
  return rows.map((row) => toExpense(row, now));
}

/**
 * What each habitant paid with meal vouchers and when (paid expenses with method MEAL_VOUCHER, up to `until`
 * when given): their own expenses, their share of split ones, and older joint ones for whoever marked them
 * paid (joint ones nobody marked paid count for nobody). For the voucher balance of the income feature.
 */
export async function listMealVoucherSpending(householdId: string, until?: string | null): Promise<{ habitantId: string; amountCents: number; date: string }[]> {
  const rows = await db.expense.findMany({
    where: { householdId, paymentMethod: "MEAL_VOUCHER", paidOn: until ? { lte: toDate(until) } : { not: null } },
    include: expenseInclude,
  });
  const now = today();
  return mealVoucherPortions(rows.map((row) => toExpense(row, now)));
}

// ── For the money feature: loans and the timeline ───────────────────────────────────────────────────

const LOAN_KINDS = ["LOAN", "DOWN_PAYMENT"] as const;

/**
 * Running (active or paused) loans and down payments, plus any other recurring expense with a total open
 * amount, each with its monthly cost and loan progress. Sorted by what is left, largest first.
 */
export async function getLoanSummaries(householdId: string): Promise<LoanSummary[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const rows = await db.recurringExpense.findMany({
    where: { householdId, status: { not: "ENDED" }, OR: [{ kind: { in: [...LOAN_KINDS] } }, { totalOpenCents: { not: null } }] },
    include: recurringInclude,
    orderBy: { payee: "asc" },
  });
  const instances = await loadInstancesForProgress(rows);
  return rows
    .map((row) => {
      const recurring = toRecurring(row, now, instances.get(row.id));
      return {
        id: recurring.id,
        payee: recurring.payee,
        kind: recurring.kind,
        status: recurring.status,
        amountCents: recurring.amountCents,
        rrule: recurring.rrule,
        monthlyCents: recurring.monthlyCents,
        nextDueDate: recurring.nextDueDate,
        totalOpen: recurring.totalOpen,
      };
    })
    .sort((a, b) => (b.totalOpen?.remainingCents ?? -1) - (a.totalOpen?.remainingCents ?? -1));
}

/**
 * Money leaving the household between `from` and `to` (inclusive, `YYYY-MM-DD`), see `ExpenseFlowItem`:
 * expenses paid in the range, every unpaid expense due up to `to` (overdue ones included, the caller decides
 * where they count), and the computed occurrences of active recurring expenses beyond the generation horizon.
 * `payer: "joint"` keeps only what the joint account pays (the money flow's coverage check).
 */
export async function listExpenseFlow(householdId: string, from: string, to: string, options: { payer?: "joint" } = {}): Promise<ExpenseFlowItem[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const notVouchers = { OR: [{ paymentMethod: null }, { paymentMethod: { not: "MEAL_VOUCHER" as const } }] };
  const payer = options.payer === "joint" ? { payerType: "JOINT" as const } : {};
  const select = { amountCents: true, dueDate: true, paidOn: true, recurringExpenseId: true, recurringExpense: { select: { kind: true } } } as const;
  const [paidRows, unpaidRows, templates] = await Promise.all([
    db.expense.findMany({ where: { householdId, ...payer, ...notVouchers, paidOn: { gte: toDate(from), lte: toDate(to) } }, select }),
    db.expense.findMany({ where: { householdId, ...payer, ...notVouchers, paidOn: null, dueDate: { lte: toDate(to) } }, select }),
    db.recurringExpense.findMany({ where: { householdId, ...payer, status: { not: "ENDED" }, ...notVouchers }, include: recurringInclude }),
  ]);
  const loanInstances = await loadInstancesForProgress(templates);
  const fromRow = (row: (typeof paidRows)[number]): ExpenseFlowItem => ({
    date: fromDate(row.paidOn ?? row.dueDate),
    amountCents: row.amountCents,
    paid: row.paidOn !== null,
    recurring: row.recurringExpenseId !== null,
    kind: row.recurringExpense ? toKind(row.recurringExpense.kind) : null,
    virtual: false,
  });
  const virtual = templates.flatMap((row) =>
    projectedOccurrences(
      {
        status: row.status,
        amountCents: row.amountCents,
        rrule: row.rrule,
        startDate: fromDate(row.startDate),
        endDate: row.endDate ? fromDate(row.endDate) : null,
        generatedUntil: row.generatedUntil ? fromDate(row.generatedUntil) : null,
        totalOpen:
          row.totalOpenCents && row.totalOpenAsOf
            ? { totalOpenCents: row.totalOpenCents, asOf: fromDate(row.totalOpenAsOf), settled: loanInstances.get(row.id) ?? [] }
            : null,
      },
      from,
      to,
    ).map((occurrence): ExpenseFlowItem => ({
      date: occurrence.dueDate,
      amountCents: occurrence.amountCents,
      paid: false,
      recurring: true,
      kind: toKind(row.kind),
      virtual: true,
    })),
  );
  return [...paidRows.map(fromRow), ...unpaidRows.map(fromRow), ...virtual];
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────────

/** Creates a one-off expense (optionally already paid), or a recurring expense and returns its first instance. */
export async function createExpense(householdId: string, input: ExpenseCreateInput): Promise<Expense> {
  await assertPayer(householdId, input);
  const now = today();

  if (!input.rrule) {
    await assertShop(householdId, input.shopId);
    const row = await db.expense.create({
      data: {
        householdId,
        ...paymentData(input),
        dueDate: toDate(input.dueDate),
        shopId: input.shopId ?? null,
        paidOn: input.paidOn ? toDate(input.paidOn) : null,
        shares: sharesCreate(input.shares),
      },
      include: expenseInclude,
    });
    await emitExpenseChanged(householdId, row.id, "created");
    return toExpense(row, now);
  }

  // A total open amount (loans) counts from the first due date unless told otherwise, and sets the end.
  const totalOpenCents = input.totalOpenCents ?? null;
  const totalOpenAsOf = totalOpenCents ? (input.totalOpenAsOf ?? input.dueDate) : null;
  let rrule = input.rrule;
  if (totalOpenCents && totalOpenAsOf) {
    const plan = planTotalOpen({ amountCents: input.amountCents, totalOpenCents, asOf: totalOpenAsOf, rrule, startDate: input.dueDate });
    rrule = withUntil(rrule, plan.lastDate);
  } else {
    const rule = parseRRule(rrule, EXPENSE_RRULE_SUPPORT);
    if (rule?.until && rule.until < input.dueDate) {
      throw badRequest("Validation failed", { rrule: ["The expense ends before its first due date"] });
    }
  }
  const { row, created } = await db.$transaction(async (tx) => {
    const recurring = await tx.recurringExpense.create({
      data: {
        householdId,
        ...paymentData(input),
        ...recurringData(input),
        rrule,
        startDate: toDate(input.dueDate),
        totalOpenCents,
        totalOpenAsOf: totalOpenAsOf ? toDate(totalOpenAsOf) : null,
        shares: sharesCreate(input.shares),
      },
      include: recurringInclude,
    });
    const created = await generateInstances(tx, recurring, input.dueDate, horizon(input.dueDate > now ? input.dueDate : now));
    const row = await tx.expense.findFirstOrThrow({
      where: { recurringExpenseId: recurring.id },
      orderBy: { dueDate: "asc" },
      include: expenseInclude,
    });
    return { row, created };
  });
  await emitExpenseChanged(householdId, created, "created");
  return toExpense(row, now);
}

/** Edits one expense only; its recurring template (if any) is unchanged. */
export async function updateExpense(householdId: string, id: string, input: ExpenseInput): Promise<Expense> {
  await findOwnExpense(householdId, id);
  await assertPayer(householdId, input);
  await assertShop(householdId, input.shopId);
  const row = await db.$transaction(async (tx) => {
    await tx.expenseShare.deleteMany({ where: { expenseId: id } });
    return tx.expense.update({
      where: { id },
      data: {
        ...paymentData(input),
        dueDate: toDate(input.dueDate),
        shopId: input.shopId ?? null,
        shares: sharesCreate(input.shares),
      },
      include: expenseInclude,
    });
  });
  await emitExpenseChanged(householdId, id, "updated");
  return toExpense(row, today());
}

/** Re-points documents of replaced instances to the new instance on the same date; forgets the others. */
async function followDocuments(replaced: { id: string; dueDate: Date }[], regenerated: { id: string; dueDate: Date }[]) {
  const newIdByDate = new Map(regenerated.map((expense) => [fromDate(expense.dueDate), expense.id]));
  const moves = replaced.flatMap((expense) => {
    const to = newIdByDate.get(fromDate(expense.dueDate));
    return to ? [{ from: expense.id, to }] : [];
  });
  await moveDocumentLinks(EXPENSE_DOCUMENT_TYPE, moves);
  await forgetDocumentLinks(
    EXPENSE_DOCUMENT_TYPE,
    replaced.filter((expense) => !newIdByDate.has(fromDate(expense.dueDate))).map((expense) => expense.id),
  );
}

/**
 * The total open amount after an edit and the RRULE that goes with it. Left out of the input: kept; `null`:
 * removed (the posted rule applies as it is). An empty as-of date means the next unpaid due date: the oldest
 * unpaid instance that stays, else the rule's first date from `cutoff` after the last paid instance. Call after the unpaid instances from
 * `cutoff` were removed: what remains from the as-of date on is settled.
 */
async function resolveTotalOpen(
  tx: Prisma.TransactionClient,
  id: string,
  existing: { totalOpenCents: number | null; totalOpenAsOf: Date | null },
  input: RecurringExpenseInput,
  cutoff: string,
): Promise<{ rrule: string; totalOpenCents: number | null; asOf: string | null }> {
  const keep = input.totalOpenCents === undefined;
  const totalOpenCents = keep ? existing.totalOpenCents : input.totalOpenCents;
  if (!totalOpenCents) return { rrule: input.rrule, totalOpenCents: null, asOf: null };

  let asOf = keep ? (existing.totalOpenAsOf ? fromDate(existing.totalOpenAsOf) : null) : (input.totalOpenAsOf ?? null);
  if (!asOf) {
    // One after the other: a transaction has one connection (see src/api/lib/prisma-adapter.ts).
    const oldestUnpaid = await tx.expense.findFirst({ where: { recurringExpenseId: id, paidOn: null }, orderBy: { dueDate: "asc" }, select: { dueDate: true } });
    const lastPaid = await tx.expense.findFirst({ where: { recurringExpenseId: id, NOT: { paidOn: null } }, orderBy: { dueDate: "desc" }, select: { dueDate: true } });
    // Else the rule's first date from the cutoff that comes after the last paid one.
    const afterPaid = lastPaid ? addDays(fromDate(lastPaid.dueDate), 1) : cutoff;
    const rule = baseRuleOf(input.rrule);
    asOf =
      (oldestUnpaid ? fromDate(oldestUnpaid.dueDate) : null) ??
      (rule ? nextOccurrence(rule, input.startDate, afterPaid > cutoff ? afterPaid : cutoff, { monthEnd: EXPENSE_MONTH_END }) : null) ??
      cutoff;
  }
  const settled = await tx.expense.findMany({
    where: { recurringExpenseId: id, dueDate: { gte: toDate(asOf) } },
    select: { dueDate: true, amountCents: true },
  });
  const plan = planTotalOpen({
    amountCents: input.amountCents,
    totalOpenCents,
    asOf,
    rrule: input.rrule,
    startDate: input.startDate,
    from: cutoff,
    settled: settled.map((row) => ({ dueDate: fromDate(row.dueDate), amountCents: row.amountCents })),
  });
  return { rrule: withUntil(input.rrule, plan.lastDate), totalOpenCents, asOf };
}

/** Edits a template and its RRULE and regenerates its open future instances (when active). */
export async function updateRecurringExpense(householdId: string, id: string, input: RecurringExpenseInput): Promise<RecurringExpense> {
  const existing = await findOwnRecurring(householdId, id);
  await assertPayer(householdId, input);
  const now = today();
  const cutoff = input.startDate < now ? input.startDate : now;

  const replacedWhere = { recurringExpenseId: id, paidOn: null, dueDate: { gte: toDate(cutoff) } };
  const { row, replaced, regenerated } = await db.$transaction(async (tx) => {
    await tx.recurringExpenseShare.deleteMany({ where: { recurringExpenseId: id } });
    const replaced = await tx.expense.findMany({ where: replacedWhere, select: { id: true, dueDate: true } });
    await tx.expense.deleteMany({ where: replacedWhere });
    // What is left from the as-of date on (paid ones, older unpaid ones) is settled; the rest is planned again.
    const totalOpen = await resolveTotalOpen(tx, id, existing, input, cutoff);
    const recurring = await tx.recurringExpense.update({
      where: { id },
      data: {
        ...paymentData(input),
        ...recurringData(input),
        rrule: totalOpen.rrule,
        startDate: toDate(input.startDate),
        totalOpenCents: totalOpen.totalOpenCents,
        totalOpenAsOf: totalOpen.asOf ? toDate(totalOpen.asOf) : null,
        shares: sharesCreate(input.shares),
      },
      include: recurringInclude,
    });
    // A changed project applies to every instance, paid ones included (projects feature).
    if (input.projectId !== undefined && (input.projectId || null) !== existing.projectId) {
      await tx.expense.updateMany({ where: { recurringExpenseId: id }, data: { projectId: input.projectId || null } });
    }
    if (existing.status === "ACTIVE") {
      await generateInstances(tx, recurring, cutoff, horizon(now > input.startDate ? now : input.startDate));
    }
    const regenerated = await tx.expense.findMany({ where: replacedWhere, select: { id: true, dueDate: true } });
    return { row: recurring, replaced, regenerated };
  });
  await followDocuments(replaced, regenerated);
  await emitExpenseChanged(householdId, replaced.map((expense) => expense.id), "deleted");
  await emitExpenseChanged(householdId, regenerated.map((expense) => expense.id), "created");
  return toRecurring(row, now);
}

/**
 * Pauses, resumes or ends a recurring expense. Pausing and ending remove the unpaid instances after today
 * (or the end date); resuming continues from tomorrow without making up the skipped occurrences.
 */
export async function setRecurringStatus(householdId: string, id: string, input: RecurringStatusInput): Promise<RecurringExpense> {
  const existing = await findOwnRecurring(householdId, id);
  const now = today();
  // Resuming something that runs would re-create instances the user deleted: nothing to do.
  if (existing.status === "ACTIVE" && input.status === "active") return toRecurring(existing, now);
  const endDate = input.status === "ended" ? (input.endDate ?? now) : null;
  const removeAfter = input.status === "ended" && endDate ? endDate : now;
  const removedWhere = { recurringExpenseId: id, paidOn: null, dueDate: { gt: toDate(removeAfter) } };

  const { row, removed } = await db.$transaction(async (tx) => {
    const removed = input.status === "active" ? [] : await tx.expense.findMany({ where: removedWhere, select: { id: true } });
    if (removed.length > 0) await tx.expense.deleteMany({ where: removedWhere });
    const row = await tx.recurringExpense.update({
      where: { id },
      data: {
        status: fromStatus(input.status),
        endDate: endDate ? toDate(endDate) : null,
        // Pausing/ending: nothing more to generate. Resuming: top-ups continue from tomorrow.
        generatedUntil: toDate(removeAfter),
      },
      include: recurringInclude,
    });
    return { row, removed };
  });
  await forgetDocumentLinks(EXPENSE_DOCUMENT_TYPE, removed.map((expense) => expense.id));
  await emitExpenseChanged(householdId, removed.map((expense) => expense.id), "deleted");
  // Resuming: the top-up creates (and announces) the upcoming instances.
  if (input.status === "active") await topUpRecurring(householdId, now);
  return toRecurring(row, now);
}

export async function markExpensePaid(householdId: string, id: string, input: ExpensePaymentInput): Promise<Expense> {
  await findOwnExpense(householdId, id);
  await assertOwnHabitants(householdId, [input.paidById], "paidById");
  const row = await db.expense.update({
    where: { id },
    data: { paidOn: toDate(input.paidOn), paidById: input.paidById || null },
    include: expenseInclude,
  });
  await emitExpenseChanged(householdId, id, "paid");
  return toExpense(row, today());
}

/** Undo a payment. An automatic (direct debit) payment keeps `autoPaidAt`, so the job doesn't mark it again. */
export async function markExpenseUnpaid(householdId: string, id: string): Promise<Expense> {
  await findOwnExpense(householdId, id);
  const row = await db.expense.update({ where: { id }, data: { paidOn: null, paidById: null }, include: expenseInclude });
  await emitExpenseChanged(householdId, id, "unpaid");
  return toExpense(row, today());
}

export async function deleteExpense(householdId: string, id: string): Promise<void> {
  await findOwnExpense(householdId, id);
  await db.expense.delete({ where: { id } });
  await forgetDocumentLinks(EXPENSE_DOCUMENT_TYPE, id);
  await emitExpenseChanged(householdId, id, "deleted");
}

/** Deletes a template and its unpaid future instances; paid and past expenses stay. */
export async function deleteRecurringExpense(householdId: string, id: string): Promise<void> {
  await findOwnRecurring(householdId, id);
  const removedWhere = { recurringExpenseId: id, paidOn: null, dueDate: { gte: toDate(today()) } };
  const removed = await db.$transaction(async (tx) => {
    const rows = await tx.expense.findMany({ where: removedWhere, select: { id: true } });
    await tx.expense.deleteMany({ where: removedWhere });
    await tx.recurringExpense.delete({ where: { id } });
    return rows;
  });
  await forgetDocumentLinks(EXPENSE_DOCUMENT_TYPE, removed.map((expense) => expense.id));
  await emitExpenseChanged(householdId, removed.map((expense) => expense.id), "deleted");
}

// ── For other features: linking a bill to an expense that exists (integrations: mail bills) ──────────

/**
 * An expense, or an occurrence of a recurring expense that has no row yet (`expenseId` null: beyond the
 * generated horizon, or a date the series skipped). Values of a virtual one come from its template.
 */
export type PaymentTarget = {
  expenseId: string | null;
  recurringExpenseId: string | null;
  payee: string;
  category: Expense["category"];
  kind: Expense["kind"];
  dueDate: string;
  amountCents: number;
  paidOn: string | null;
  structuredCommunication: string | null;
  reference: string | null;
  iban: string | null;
  beneficiaryName: string | null;
};

const targetOfExpense = (expense: Expense): PaymentTarget => ({
  expenseId: expense.id,
  recurringExpenseId: expense.recurringExpenseId,
  payee: expense.payee,
  category: expense.category,
  kind: expense.kind,
  dueDate: expense.dueDate,
  amountCents: expense.amountCents,
  paidOn: expense.paidOn,
  structuredCommunication: expense.structuredCommunication,
  reference: expense.reference,
  iban: expense.iban,
  beneficiaryName: expense.beneficiaryName,
});

const virtualTarget = (row: RecurringRowForTarget, dueDate: string, amountCents: number): PaymentTarget => ({
  expenseId: null,
  recurringExpenseId: row.id,
  payee: row.payee,
  category: toCategory(row.category),
  kind: toKind(row.kind),
  dueDate,
  amountCents,
  paidOn: null,
  structuredCommunication: row.structuredCommunication,
  reference: row.reference,
  iban: row.iban,
  beneficiaryName: row.beneficiaryName,
});

type RecurringRowForTarget = Awaited<ReturnType<typeof findOwnRecurring>>;

const loanOf = (row: RecurringRowForTarget, settled: { dueDate: string; amountCents: number }[]) =>
  row.totalOpenCents && row.totalOpenAsOf ? { totalOpenCents: row.totalOpenCents, asOf: fromDate(row.totalOpenAsOf), settled } : null;

/** The template's computed occurrences beyond its generated horizon in [from, to] (with a loan's planned amounts). */
function virtualOf(row: RecurringRowForTarget, settled: { dueDate: string; amountCents: number }[], from: string, to: string) {
  return virtualOccurrences(
    {
      amountCents: row.amountCents,
      rrule: row.rrule,
      startDate: fromDate(row.startDate),
      endDate: row.endDate ? fromDate(row.endDate) : null,
      generatedUntil: row.generatedUntil ? fromDate(row.generatedUntil) : null,
      totalOpen: loanOf(row, settled),
    },
    from,
    to,
  );
}

/**
 * Expenses due in [from, to] (inclusive), soonest first: unpaid ones, plus with `includePaid` also paid ones
 * (due or paid in the range). With `includeVirtual`, also the computed occurrences of active recurring
 * expenses beyond their generated horizon in that range (as the calendar shows them).
 */
export async function listPaymentTargets(
  householdId: string,
  from: string,
  to: string,
  { includePaid = false, includeVirtual = false }: { includePaid?: boolean; includeVirtual?: boolean } = {},
): Promise<PaymentTarget[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const range = { gte: toDate(from), lte: toDate(to) };
  const rows = await db.expense.findMany({
    where: includePaid ? { householdId, OR: [{ dueDate: range }, { paidOn: range }] } : { householdId, paidOn: null, dueDate: range },
    include: expenseInclude,
    orderBy: [{ dueDate: "asc" }, { payee: "asc" }],
    take: 2000,
  });
  const targets = rows.map((row) => targetOfExpense(toExpense(row, now)));
  if (!includeVirtual) return targets;
  const templates = await db.recurringExpense.findMany({ where: { householdId, status: "ACTIVE" }, include: recurringInclude });
  const loanInstances = await loadInstancesForProgress(templates);
  const virtual = templates.flatMap((row) =>
    virtualOf(row, loanInstances.get(row.id) ?? [], from, to).map((occurrence) => virtualTarget(row, occurrence.dueDate, occurrence.amountCents)),
  );
  return [...targets, ...virtual].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.payee.localeCompare(b.payee));
}

/** One expense as a payment target (household-scoped: another household's id is a 404). */
export async function getPaymentTarget(householdId: string, id: string): Promise<PaymentTarget> {
  return targetOfExpense(toExpense(await findOwnExpense(householdId, id), today()));
}

/** Every recurring expense (any status), by payee. */
export async function listRecurringExpenses(householdId: string): Promise<RecurringExpense[]> {
  const now = today();
  const rows = await db.recurringExpense.findMany({ where: { householdId }, include: recurringInclude, orderBy: { payee: "asc" } });
  return rows.map((row) => toRecurring(row, now));
}

/** One recurring expense (household-scoped). */
export async function getRecurringExpense(householdId: string, id: string): Promise<RecurringExpense> {
  return toRecurring(await findOwnRecurring(householdId, id), today());
}

const ruleDates = (row: RecurringRowForTarget, from: string, to: string) => {
  const end = row.endDate && fromDate(row.endDate) < to ? fromDate(row.endDate) : to;
  const rule = parseRRule(row.rrule, EXPENSE_RRULE_SUPPORT);
  return rule && from <= end ? expandRRule(rule, fromDate(row.startDate), { from, to: end, limit: 400, monthEnd: EXPENSE_MONTH_END }) : [];
};

/**
 * The occurrences of a recurring expense due in [from, to]: its instances (also moved or paid ones) and, for
 * the rule's dates without one, a virtual occurrence (beyond the horizon, skipped while paused, or deleted).
 */
export async function listRecurringOccurrences(householdId: string, id: string, from: string, to: string): Promise<PaymentTarget[]> {
  const now = today();
  await topUpRecurring(householdId, now);
  const row = await findOwnRecurring(householdId, id);
  const instances = await db.expense.findMany({
    where: { householdId, recurringExpenseId: id, dueDate: { gte: toDate(from), lte: toDate(to) } },
    include: expenseInclude,
    orderBy: { dueDate: "asc" },
  });
  const existing = new Set(instances.map((instance) => fromDate(instance.dueDate)));
  const loanInstances = await loadInstancesForProgress([row]);
  const planned = new Map(virtualOf(row, loanInstances.get(row.id) ?? [], from, to).map((occurrence) => [occurrence.dueDate, occurrence.amountCents]));
  const virtual = ruleDates(row, from, to)
    .filter((date) => !existing.has(date))
    .map((date) => virtualTarget(row, date, planned.get(date) ?? row.amountCents));
  return [...instances.map((instance) => targetOfExpense(toExpense(instance, now))), ...virtual].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * The instance of a recurring expense due on `dueDate` (one of its rule's dates), created when it doesn't
 * exist. Beyond the generated horizon of an active one, instances are materialised up to that date the
 * normal way (so the horizon stays one range and later top-ups don't create it again); a date the series
 * skipped gets just that instance. Announces what it created (`expense-events`). Idempotent.
 */
export async function ensureRecurringInstance(householdId: string, id: string, dueDate: string): Promise<{ expense: Expense; created: boolean }> {
  const now = today();
  const recurring = await findOwnRecurring(householdId, id);
  const find = () => db.expense.findFirst({ where: { householdId, recurringExpenseId: id, dueDate: toDate(dueDate) }, include: expenseInclude });
  const found = await find();
  if (found) return { expense: toExpense(found, now), created: false };
  if (!ruleDates(recurring, dueDate, dueDate).includes(dueDate)) {
    throw badRequest("Validation failed", { dueDate: ["Not a due date of this recurring expense"] });
  }

  const created: string[] = [];
  const generatedUntil = recurring.generatedUntil ? fromDate(recurring.generatedUntil) : null;
  if (recurring.status === "ACTIVE" && (!generatedUntil || generatedUntil < dueDate)) {
    const from = generatedUntil ? addDays(generatedUntil, 1) : fromDate(recurring.startDate);
    created.push(...(await db.$transaction((tx) => generateInstances(tx, recurring, from, dueDate))));
  }
  let row = await find();
  if (!row) {
    await db.$transaction(async (tx) => {
      await tx.expense.createMany({ data: [instanceData(recurring, dueDate, recurring.amountCents)], skipDuplicates: true });
      const instance = await tx.expense.findFirstOrThrow({ where: { recurringExpenseId: id, dueDate: toDate(dueDate) }, select: { id: true, amountCents: true } });
      if (recurring.payerType === "SPLIT" && recurring.shares.length > 0) {
        await tx.expenseShare.createMany({
          data: scaleShares(recurring.shares, recurring.amountCents, instance.amountCents).map((share) => ({ expenseId: instance.id, habitantId: share.habitantId, amountCents: share.amountCents })),
          skipDuplicates: true,
        });
      }
      created.push(instance.id);
    });
    row = await find();
  }
  if (!row) throw notFound("Expense not found");
  await emitExpenseChanged(householdId, [...new Set(created)], "created");
  return { expense: toExpense(row, now), created: true };
}

/** Changes to one expense's amount, due date and payment details; left out = unchanged. */
export type ExpenseDetailsPatch = {
  amountCents?: number;
  dueDate?: string;
  /** Replaces a free-text reference. */
  structuredCommunication?: string;
  iban?: string;
  beneficiaryName?: string;
};

function checkedDetails(patch: Omit<ExpenseDetailsPatch, "amountCents" | "dueDate">) {
  const data: { structuredCommunication?: string; reference?: null; iban?: string; beneficiaryName?: string } = {};
  if (patch.structuredCommunication !== undefined) {
    const ogm = normalizeStructuredCommunication(patch.structuredCommunication);
    if (!ogm) throw badRequest("Validation failed", { structuredCommunication: ["Invalid structured communication"] });
    data.structuredCommunication = ogm;
    data.reference = null;
  }
  if (patch.iban !== undefined) {
    const iban = normalizeIban(patch.iban);
    if (!iban) throw badRequest("Validation failed", { iban: ["Invalid IBAN"] });
    data.iban = iban;
  }
  if (patch.beneficiaryName !== undefined) {
    const name = patch.beneficiaryName.trim().slice(0, 70);
    if (!name) throw badRequest("Validation failed", { beneficiaryName: ["Required"] });
    data.beneficiaryName = name;
  }
  return data;
}

/**
 * Updates some fields of one expense (its template stays as it is). Split shares are rescaled to a new
 * amount. A paid expense's amount or due date only changes with `allowPaidChanges` (the person confirmed
 * it). Announces the change (`updated`), so its pay task follows.
 */
export async function patchExpenseDetails(
  householdId: string,
  id: string,
  patch: ExpenseDetailsPatch,
  { allowPaidChanges = false }: { allowPaidChanges?: boolean } = {},
): Promise<Expense> {
  const row = await findOwnExpense(householdId, id);
  if (row.paidOn && !allowPaidChanges && (patch.amountCents !== undefined || patch.dueDate !== undefined)) {
    throw badRequest("This expense is already paid", { amountCents: ["Already paid"] });
  }
  if (patch.amountCents !== undefined && (!Number.isInteger(patch.amountCents) || patch.amountCents <= 0)) {
    throw badRequest("Validation failed", { amountCents: ["Invalid amount"] });
  }
  const data = {
    ...checkedDetails(patch),
    ...(patch.amountCents !== undefined && { amountCents: patch.amountCents }),
    ...(patch.dueDate !== undefined && { dueDate: toDate(patch.dueDate) }),
  };
  if (Object.keys(data).length === 0) return toExpense(row, today());
  const rescale = patch.amountCents !== undefined && row.payerType === "SPLIT" && row.shares.length > 0;
  let updated;
  try {
    updated = await db.$transaction(async (tx) => {
      if (rescale) {
        await tx.expenseShare.deleteMany({ where: { expenseId: id } });
        await tx.expenseShare.createMany({
          data: scaleShares(row.shares, row.amountCents, patch.amountCents ?? row.amountCents).map((share) => ({ expenseId: id, habitantId: share.habitantId, amountCents: share.amountCents })),
        });
      }
      return tx.expense.update({ where: { id }, data, include: expenseInclude });
    });
  } catch (error) {
    // One instance per recurring expense per due date.
    if ((error as { code?: string }).code === "P2002") {
      throw badRequest("Validation failed", { dueDate: ["Another payment of this recurring expense is due on that date"] });
    }
    throw error;
  }
  await emitExpenseChanged(householdId, id, "updated");
  return toExpense(updated, today());
}

/**
 * Sets a recurring expense's IBAN, structured communication and/or beneficiary ("this and upcoming"), without
 * regenerating anything: unpaid instances due from today on that still had the template's old value take
 * the new one (except `exceptExpenseId`, which the caller handles). Announces the instances it changed.
 */
export async function patchRecurringPaymentDetails(
  householdId: string,
  id: string,
  patch: Pick<ExpenseDetailsPatch, "structuredCommunication" | "iban" | "beneficiaryName">,
  { exceptExpenseId }: { exceptExpenseId?: string } = {},
): Promise<RecurringExpense> {
  const existing = await findOwnRecurring(householdId, id);
  const data = checkedDetails(patch);
  if (Object.keys(data).length === 0) return toRecurring(existing, today());
  const upcoming = {
    householdId,
    recurringExpenseId: id,
    paidOn: null,
    dueDate: { gte: toDate(today()) },
    ...(exceptExpenseId && { id: { not: exceptExpenseId } }),
  };
  const { row, changed } = await db.$transaction(async (tx) => {
    const changed = new Set<string>();
    const follow = async (where: Prisma.ExpenseWhereInput, values: Prisma.ExpenseUpdateManyMutationInput) => {
      const rows = await tx.expense.findMany({ where: { ...upcoming, ...where }, select: { id: true } });
      if (rows.length === 0) return;
      await tx.expense.updateMany({ where: { id: { in: rows.map((item) => item.id) } }, data: values });
      for (const item of rows) changed.add(item.id);
    };
    // One after the other: a transaction has one connection.
    if (data.structuredCommunication) {
      await follow(
        { structuredCommunication: existing.structuredCommunication, reference: existing.structuredCommunication ? undefined : existing.reference },
        { structuredCommunication: data.structuredCommunication, reference: null },
      );
    }
    if (data.iban) await follow({ iban: existing.iban }, { iban: data.iban });
    if (data.beneficiaryName) await follow({ beneficiaryName: existing.beneficiaryName }, { beneficiaryName: data.beneficiaryName });
    const row = await tx.recurringExpense.update({ where: { id }, data, include: recurringInclude });
    return { row, changed: [...changed] };
  });
  await emitExpenseChanged(householdId, changed, "updated");
  return toRecurring(row, today());
}
