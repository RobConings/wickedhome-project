import {
  amountEntryOn,
  buildOccurrences,
  incomeFlowItems,
  monthRange,
  monthTotals,
  nextOccurrenceOf,
  occurrencesPerYear,
  upcomingIncomes,
  voucherBalances,
  type IncomeFlowItem,
} from "@/features/income/types/income-calculations";
import {
  INCOME_RRULE_SUPPORT,
  VOUCHER_KIND,
  type AmountMode,
  type Income,
  type IncomeAmountInput,
  type IncomeInput,
  type IncomeKind,
  type IncomeMonthTotals,
  type IncomeOccurrence,
  type IncomeOverview,
  type IncomeSource,
  type IncomeSourceCreateInput,
  type IncomeSourceUpdateInput,
  type IncomeTargetAccount,
  type VoucherBalance,
} from "@/features/income/types/income";
import { addMonthsClamped, todayIn } from "@/types/dates";
import { parseRRule } from "@/types/recurrence";
import { listMealVoucherSpending } from "../expenses/expenses.service";
import {
  db,
  type Income as IncomeRow,
  type IncomeAmountMode as AmountModeRow,
  type IncomeKind as KindRow,
  type Prisma,
} from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";

/*
 * Income: recurring sources (planned occurrences computed from the RRULE, never stored) and incomes
 * actually received. The money feature reads the month figures, voucher balances and incomes that land on
 * a joint account through the exported functions below.
 */

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const optionalDate = (date: Date | null) => (date ? fromDate(date) : null);
const toKind = (value: KindRow) => value.toLowerCase() as IncomeKind;
const fromKind = (value: IncomeKind) => value.toUpperCase() as KindRow;
const toMode = (value: AmountModeRow) => value.toLowerCase() as AmountMode;
const fromMode = (value: AmountMode) => value.toUpperCase() as AmountModeRow;
const today = () => todayIn();

/** Recorded incomes older than this are left out of the overview list. */
const HISTORY_MONTHS = 24;

const sourceInclude = { amounts: { orderBy: { effectiveFrom: "asc" } } } as const;
type SourceRow = Prisma.IncomeSourceGetPayload<{ include: typeof sourceInclude }>;

function toIncome(row: IncomeRow): Income {
  return {
    id: row.id,
    habitantId: row.habitantId,
    date: fromDate(row.date),
    amountCents: row.amountCents,
    kind: toKind(row.kind),
    description: row.description,
    sourceId: row.sourceId,
    periodDate: optionalDate(row.periodDate),
    targetAccountId: row.targetAccountId,
    note: row.note,
  };
}

function toSource(row: SourceRow, now: string): IncomeSource {
  const amountMode = toMode(row.amountMode);
  const amounts = row.amounts.map((amount) => ({ id: amount.id, effectiveFrom: fromDate(amount.effectiveFrom), amountCents: amount.amountCents }));
  const schedule = { rrule: row.rrule, startDate: fromDate(row.startDate), endDate: optionalDate(row.endDate) };
  const current = amountMode === "fixed" ? amountEntryOn(amounts, now) : null;
  const currentAmountCents = amountMode === "fixed" ? (current?.amountCents ?? null) : row.estimateCents;
  return {
    id: row.id,
    habitantId: row.habitantId,
    name: row.name,
    kind: toKind(row.kind),
    ...schedule,
    amountMode,
    estimateCents: row.estimateCents,
    targetAccountId: row.targetAccountId,
    notes: row.notes,
    amounts,
    currentAmountCents,
    currentAmountFrom: current?.effectiveFrom ?? null,
    nextDate: nextOccurrenceOf(schedule, now),
    active: !schedule.endDate || schedule.endDate >= now,
    monthlyCents: currentAmountCents === null ? null : Math.round((currentAmountCents * occurrencesPerYear(row.rrule)) / 12),
  };
}

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────────

async function assertHabitant(householdId: string, habitantId: string | null) {
  if (!habitantId) return;
  const found = await db.habitant.count({ where: { id: habitantId, householdId } });
  if (!found) throw badRequest("Validation failed", { habitantId: ["Unknown habitant"] });
}

/** A target account must be one of the household's joint accounts (current or savings). */
async function assertTargetAccount(householdId: string, accountId: string | null) {
  if (!accountId) return;
  const found = await db.paymentAccount.count({ where: { id: accountId, householdId, kind: { in: ["JOINT", "SAVINGS"] } } });
  if (!found) throw badRequest("Validation failed", { targetAccountId: ["Unknown account"] });
}

function assertRule(rrule: string, startDate: string) {
  const rule = parseRRule(rrule, INCOME_RRULE_SUPPORT);
  if (rule?.until && rule.until < startDate) throw badRequest("Validation failed", { rrule: ["The income ends before it starts"] });
}

async function findOwnSource(householdId: string, id: string) {
  const row = await db.incomeSource.findFirst({ where: { id, householdId }, include: sourceInclude });
  if (!row) throw notFound("Income source not found");
  return row;
}

async function findOwnIncome(householdId: string, id: string) {
  const row = await db.income.findFirst({ where: { id, householdId } });
  if (!row) throw notFound("Income not found");
  return row;
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────────────

async function loadSources(householdId: string, now: string) {
  const rows = await db.incomeSource.findMany({ where: { householdId }, include: sourceInclude, orderBy: [{ name: "asc" }] });
  return rows.map((row) => toSource(row, now));
}

/**
 * Planned occurrences of a month with what was recorded for them, the month's totals and the recorded
 * incomes dated after today that no occurrence shows; received vs expected is relative to today.
 */
export async function getIncomeMonth(
  householdId: string,
  month: string,
): Promise<{ occurrences: IncomeOccurrence[]; totals: IncomeMonthTotals; incomes: Income[]; upcoming: Income[] }> {
  const now = today();
  const { from, to } = monthRange(month);
  const [sources, rows] = await Promise.all([
    loadSources(householdId, now),
    // Incomes of the month, plus those recorded for an occurrence of this month on another date.
    db.income.findMany({
      where: { householdId, OR: [{ date: { gte: toDate(from), lte: toDate(to) } }, { periodDate: { gte: toDate(from), lte: toDate(to) } }] },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const incomes = rows.map(toIncome);
  const occurrences = buildOccurrences(sources, incomes, from, to, now);
  return { occurrences, totals: monthTotals(month, occurrences, incomes, now), incomes, upcoming: upcomingIncomes(month, occurrences, incomes, now) };
}

/** Meal voucher balance per habitant on `on` (default today): FIFO over lots that expire after 12 months. */
export async function getVoucherBalances(householdId: string, on: string = today()): Promise<VoucherBalance[]> {
  const [voucherIncomes, spending] = await Promise.all([
    db.income.findMany({
      where: { householdId, kind: "MEAL_VOUCHERS", date: { lte: toDate(on) } },
      select: { habitantId: true, amountCents: true, date: true },
    }),
    listMealVoucherSpending(householdId, on),
  ]);
  return voucherBalances(
    voucherIncomes.map((row) => ({ habitantId: row.habitantId, amountCents: row.amountCents, kind: VOUCHER_KIND, date: fromDate(row.date) })),
    spending,
    on,
  );
}

/** An income that lands on a joint account, as it affects that account's balance. */
export type AccountIncome = {
  id: string;
  label: string;
  kind: IncomeKind;
  amountCents: number;
  date: string;
  accountId: string;
  habitantId: string | null;
  /** When it was recorded (ISO): orders it against a correction of the same day. */
  recordedAt: string;
};

/**
 * Incomes with a target account (not meal vouchers: they never reach the bank), received on or after
 * `since` when given. The money feature counts them in the account balance; they are not copied into the
 * ledger, so editing or deleting the income is reflected at once.
 */
export async function listAccountIncomes(householdId: string, since?: string | null): Promise<AccountIncome[]> {
  const rows = await db.income.findMany({
    where: { householdId, targetAccountId: { not: null }, kind: { not: "MEAL_VOUCHERS" }, ...(since ? { date: { gte: toDate(since) } } : {}) },
    include: { source: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.flatMap((row) =>
    row.targetAccountId
      ? [
          {
            id: row.id,
            label: row.description ?? row.source?.name ?? "",
            kind: toKind(row.kind),
            amountCents: row.amountCents,
            date: fromDate(row.date),
            accountId: row.targetAccountId,
            habitantId: row.habitantId,
            recordedAt: row.createdAt.toISOString(),
          },
        ]
      : [],
  );
}

/**
 * Income between `from` and `to` (inclusive, `YYYY-MM-DD`) for the money flow timeline, see `incomeFlowItems`.
 */
export async function listIncomeFlow(householdId: string, from: string, to: string): Promise<IncomeFlowItem[]> {
  const now = today();
  const [sources, rows] = await Promise.all([
    loadSources(householdId, now),
    db.income.findMany({
      where: { householdId, OR: [{ date: { gte: toDate(from), lte: toDate(to) } }, { periodDate: { gte: toDate(from), lte: toDate(to) } }] },
    }),
  ]);
  return incomeFlowItems(sources, rows.map(toIncome), from, to, now);
}

async function loadTargetAccounts(householdId: string): Promise<IncomeTargetAccount[]> {
  const rows = await db.paymentAccount.findMany({
    where: { householdId, archived: false, kind: { in: ["JOINT", "SAVINGS"] } },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, kind: true },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind === "SAVINGS" ? "savings" : "joint" }));
}

export async function getIncomeOverview(householdId: string, month: string): Promise<IncomeOverview> {
  const now = today();
  const since = toDate(addMonthsClamped(now, -HISTORY_MONTHS));
  const [sources, monthData, rows, vouchers, accounts] = await Promise.all([
    loadSources(householdId, now),
    getIncomeMonth(householdId, month),
    db.income.findMany({ where: { householdId, date: { gte: since } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    getVoucherBalances(householdId),
    loadTargetAccounts(householdId),
  ]);
  return {
    today: now,
    month,
    sources,
    occurrences: monthData.occurrences,
    upcoming: monthData.upcoming,
    incomes: rows.map(toIncome),
    totals: monthData.totals,
    vouchers,
    accounts,
  };
}

// ── Mutations: sources ──────────────────────────────────────────────────────────────────────────────

export async function createIncomeSource(householdId: string, input: IncomeSourceCreateInput): Promise<IncomeSource> {
  await assertHabitant(householdId, input.habitantId);
  await assertTargetAccount(householdId, input.targetAccountId);
  assertRule(input.rrule, input.startDate);
  const fixed = input.amountMode === "fixed";
  const row = await db.incomeSource.create({
    data: {
      householdId,
      habitantId: input.habitantId,
      name: input.name,
      kind: fromKind(input.kind),
      rrule: input.rrule,
      startDate: toDate(input.startDate),
      endDate: input.endDate ? toDate(input.endDate) : null,
      amountMode: fromMode(input.amountMode),
      estimateCents: fixed ? null : (input.estimateCents ?? null),
      targetAccountId: input.targetAccountId,
      notes: input.notes,
      amounts: fixed && input.amountCents ? { create: [{ effectiveFrom: toDate(input.startDate), amountCents: input.amountCents }] } : undefined,
    },
    include: sourceInclude,
  });
  return toSource(row, today());
}

/**
 * Edits a source. For a fixed source, a different amount is added to the history from `amountFrom`
 * (default today; an entry on that date is replaced), so earlier occurrences keep their amount.
 */
export async function updateIncomeSource(householdId: string, id: string, input: IncomeSourceUpdateInput): Promise<IncomeSource> {
  const existing = await findOwnSource(householdId, id);
  await assertHabitant(householdId, input.habitantId);
  await assertTargetAccount(householdId, input.targetAccountId);
  assertRule(input.rrule, input.startDate);
  const now = today();
  const fixed = input.amountMode === "fixed";
  const amounts = existing.amounts.map((amount) => ({ effectiveFrom: fromDate(amount.effectiveFrom), amountCents: amount.amountCents }));
  if (fixed && amounts.length === 0 && !input.amountCents) {
    throw badRequest("Validation failed", { amountCents: ["Enter the amount"] });
  }
  // Without any history the amount applies from the start; otherwise from the chosen date.
  const amountFrom = amounts.length === 0 ? input.startDate : (input.amountFrom ?? now);
  const currentThen = amountEntryOn(amounts, amountFrom);
  const newAmount = fixed && input.amountCents && input.amountCents !== currentThen?.amountCents ? input.amountCents : null;

  const row = await db.$transaction(async (tx) => {
    if (newAmount !== null) {
      await tx.incomeAmount.upsert({
        where: { sourceId_effectiveFrom: { sourceId: id, effectiveFrom: toDate(amountFrom) } },
        create: { sourceId: id, effectiveFrom: toDate(amountFrom), amountCents: newAmount },
        update: { amountCents: newAmount },
      });
    }
    return tx.incomeSource.update({
      where: { id },
      data: {
        habitantId: input.habitantId,
        name: input.name,
        kind: fromKind(input.kind),
        rrule: input.rrule,
        startDate: toDate(input.startDate),
        endDate: input.endDate ? toDate(input.endDate) : null,
        amountMode: fromMode(input.amountMode),
        estimateCents: fixed ? null : (input.estimateCents ?? null),
        targetAccountId: input.targetAccountId,
        notes: input.notes,
      },
      include: sourceInclude,
    });
  });
  return toSource(row, now);
}

/** Adds (or replaces, on the same date) an entry of a fixed source's amount history. */
export async function addIncomeAmount(householdId: string, id: string, input: IncomeAmountInput): Promise<IncomeSource> {
  await findOwnSource(householdId, id);
  await db.incomeAmount.upsert({
    where: { sourceId_effectiveFrom: { sourceId: id, effectiveFrom: toDate(input.effectiveFrom) } },
    create: { sourceId: id, effectiveFrom: toDate(input.effectiveFrom), amountCents: input.amountCents },
    update: { amountCents: input.amountCents },
  });
  return toSource(await findOwnSource(householdId, id), today());
}

/** Removes an entry of the amount history; the last one stays (a fixed source always has an amount). */
export async function deleteIncomeAmount(householdId: string, id: string, amountId: string): Promise<IncomeSource> {
  const source = await findOwnSource(householdId, id);
  if (!source.amounts.some((amount) => amount.id === amountId)) throw notFound("Amount not found");
  if (source.amounts.length <= 1) throw conflict("A fixed income keeps at least one amount");
  await db.incomeAmount.delete({ where: { id: amountId } });
  return toSource(await findOwnSource(householdId, id), today());
}

/** Deletes a source; recorded incomes stay (as history, no longer linked). */
export async function deleteIncomeSource(householdId: string, id: string): Promise<void> {
  await findOwnSource(householdId, id);
  await db.incomeSource.delete({ where: { id } });
}

// ── Mutations: incomes ──────────────────────────────────────────────────────────────────────────────

/** For an occurrence of a source: who and kind always come from the source. */
async function incomeData(householdId: string, input: IncomeInput, ownId?: string) {
  let habitantId = input.habitantId;
  let kind = input.kind;
  if (input.sourceId) {
    const source = await findOwnSource(householdId, input.sourceId);
    habitantId = source.habitantId;
    kind = toKind(source.kind);
    if (input.periodDate) {
      const taken = await db.income.findFirst({ where: { sourceId: input.sourceId, periodDate: toDate(input.periodDate), id: ownId ? { not: ownId } : undefined } });
      if (taken) throw badRequest("Validation failed", { periodDate: ["Already recorded for this period"] });
    }
  }
  await assertHabitant(householdId, habitantId);
  await assertTargetAccount(householdId, input.targetAccountId);
  return {
    habitantId,
    date: toDate(input.date),
    amountCents: input.amountCents,
    kind: fromKind(kind),
    description: input.description,
    sourceId: input.sourceId,
    periodDate: input.periodDate ? toDate(input.periodDate) : null,
    targetAccountId: input.targetAccountId,
    note: input.note,
  };
}

export async function createIncome(householdId: string, input: IncomeInput): Promise<Income> {
  const data = await incomeData(householdId, input);
  return toIncome(await db.income.create({ data: { householdId, ...data } }));
}

export async function updateIncome(householdId: string, id: string, input: IncomeInput): Promise<Income> {
  await findOwnIncome(householdId, id);
  const data = await incomeData(householdId, input, id);
  return toIncome(await db.income.update({ where: { id }, data }));
}

export async function deleteIncome(householdId: string, id: string): Promise<void> {
  await findOwnIncome(householdId, id);
  await db.income.delete({ where: { id } });
}
