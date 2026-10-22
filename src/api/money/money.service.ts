import { randomUUID } from "node:crypto";
import { jointCostsOfMonth } from "@/features/money/types/contribution-settlement";
import {
  absorbedKeys,
  accountForJointExpense,
  balanceAt,
  contributionRows,
  defaultJointAccount,
  dropBeforeOpening,
  lastCorrectionAt,
  monthBounds,
  parseTransferFrom,
  runLedger,
  summarizeMonth,
  type ContributionInput,
  type LedgerItem,
} from "@/features/money/types/money-calculations";
import {
  ACCOUNT_COLORS,
  type AccountCreateInput,
  type AccountKind,
  type AccountUpdateInput,
  type ContributionPlan,
  type ContributionPlanInput,
  type DirectPaymentInput,
  type KeepExtraInput,
  type PlanAmountsInput,
  type TakeBackInput,
  type JointAccount,
  type LedgerLine,
  type LedgerType,
  type MoneyIncomeRow,
  type MoneyLoans,
  type MoneyMonth,
  type MoneySummary,
  type MoneyTimeline,
  type OtherEntryInput,
  type RecordTransferInput,
  type SetBalanceInput,
} from "@/features/money/types/money";
import { buildMoneyTimeline, loanTotals } from "@/features/money/types/money-timeline";
import { formatDate } from "@/types/date-format";
import { addDays, monthOf, todayIn } from "@/types/dates";
import { audit, type AuditActor } from "../audit/audit.service";
import { getLoanSummaries, listExpenseFlow, listExpensesBetween, listJointPayments } from "../expenses/expenses.service";
import { getIncomeMonth, getVoucherBalances, listAccountIncomes, listIncomeFlow } from "../income/income.service";
import {
  db,
  type AccountEntry as EntryRow,
  type AccountEntryType as EntryTypeRow,
  type ContributionPlan as PlanRow,
  type Prisma,
} from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";

/*
 * Joint accounts (current + savings), their ledger and the month overview. Balance = latest CORRECTION +
 * everything after it. Paid JOINT expenses (listJointPayments) and incomes with a target account
 * (listAccountIncomes) are computed into the ledger on every read, never stored: marking an expense unpaid
 * again, or editing an income, changes the balance at once, and nothing can be counted twice.
 */

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const optionalDate = (date: Date | null) => (date ? fromDate(date) : null);
const today = () => todayIn();

const accountInclude = { owners: { orderBy: { position: "asc" } } } as const;
type AccountRow = Prisma.PaymentAccountGetPayload<{ include: typeof accountInclude }>;

const JOINT_KINDS = ["JOINT", "SAVINGS"] as const;
const toAccountKind = (kind: AccountRow["kind"]): AccountKind => (kind === "SAVINGS" ? "savings" : "joint");
const toEntryType = (type: EntryTypeRow) => type.toLowerCase() as LedgerType;

// ── Ledger ──────────────────────────────────────────────────────────────────────────────────────────

function entryItem(row: EntryRow): LedgerItem {
  return {
    key: `entry:${row.id}`,
    source: "entry",
    sourceId: row.id,
    accountId: row.accountId,
    date: fromDate(row.date),
    type: toEntryType(row.type),
    amountCents: row.amountCents,
    setBalanceCents: row.type === "CORRECTION" ? row.balanceCents : null,
    habitantId: row.habitantId,
    counterpartAccountId: row.counterpartAccountId,
    label: null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

type AccountRef = { id: string; kind: AccountKind; isDefault: boolean; archived: boolean; createdAt: string };

const toRef = (row: AccountRow): AccountRef => ({
  id: row.id,
  kind: toAccountKind(row.kind),
  isDefault: row.isDefault,
  archived: row.archived,
  createdAt: row.createdAt.toISOString(),
});

async function loadAccounts(householdId: string) {
  return db.paymentAccount.findMany({
    where: { householdId, kind: { in: [...JOINT_KINDS] } },
    include: accountInclude,
    orderBy: [{ archived: "asc" }, { kind: "asc" }, { createdAt: "asc" }],
  });
}

/** The ledger lines (chronological, with running balance) of every joint account. */
async function buildLedgers(householdId: string, accounts: AccountRow[], now: string) {
  const ids = accounts.map((account) => account.id);
  const entries = ids.length ? await db.accountEntry.findMany({ where: { householdId, accountId: { in: ids } } }) : [];
  // Computed items only matter from the first opening balance on.
  const firstCorrection = entries
    .filter((entry) => entry.type === "CORRECTION")
    .map((entry) => fromDate(entry.date))
    .sort()[0];
  const [payments, incomes] = ids.length
    ? await Promise.all([listJointPayments(householdId, firstCorrection ?? null), listAccountIncomes(householdId, firstCorrection ?? null)])
    : [[], []];

  const refs = accounts.map(toRef);
  const items = new Map<string, LedgerItem[]>(ids.map((id) => [id, []]));
  // A direct payment between two people: two CONTRIBUTION entries sharing a transfer id.
  const directPairs = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    if (entry.type !== "CONTRIBUTION" || !entry.transferId) continue;
    directPairs.set(entry.transferId, [...(directPairs.get(entry.transferId) ?? []), entry]);
  }
  for (const entry of entries) {
    const item = entryItem(entry);
    if (entry.type === "CONTRIBUTION" && entry.transferId) {
      item.counterpartHabitantId = directPairs.get(entry.transferId)?.find((other) => other.id !== entry.id)?.habitantId ?? null;
    }
    items.get(entry.accountId)?.push(item);
  }
  for (const payment of payments) {
    const accountId = accountForJointExpense(payment.paymentAccountId, refs);
    if (!accountId) continue;
    items.get(accountId)?.push({
      key: `expense:${payment.id}`,
      source: "expense",
      sourceId: payment.id,
      accountId,
      date: payment.paidOn,
      type: "expense",
      amountCents: -payment.amountCents,
      setBalanceCents: null,
      habitantId: null,
      counterpartAccountId: null,
      label: payment.payee,
      note: null,
      createdAt: payment.recordedAt,
    });
  }
  for (const income of incomes) {
    items.get(income.accountId)?.push({
      key: `income:${income.id}`,
      source: "income",
      sourceId: income.id,
      accountId: income.accountId,
      date: income.date,
      type: "income",
      amountCents: income.amountCents,
      setBalanceCents: null,
      habitantId: income.habitantId,
      counterpartAccountId: null,
      label: income.label || null,
      note: null,
      createdAt: income.recordedAt,
    });
  }
  return new Map<string, LedgerLine[]>(ids.map((id) => [id, runLedger(dropBeforeOpening(items.get(id) ?? []), now)]));
}

function toAccount(row: AccountRow, lines: LedgerLine[], now: string): JointAccount {
  return {
    id: row.id,
    name: row.name,
    kind: toAccountKind(row.kind),
    iban: row.iban,
    color: row.color,
    ownerIds: row.owners.map((owner) => owner.habitantId),
    isDefault: row.isDefault,
    archived: row.archived,
    balanceCents: balanceAt(lines, now),
    lastCorrection: lastCorrectionAt(lines, now),
  };
}

function toPlan(row: PlanRow): ContributionPlan {
  return {
    id: row.id,
    habitantId: row.habitantId,
    accountId: row.accountId,
    amountCents: row.amountCents,
    dayOfMonth: row.dayOfMonth,
    activeFrom: fromDate(row.activeFrom),
    activeTo: optionalDate(row.activeTo),
    note: row.note,
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────────────

/** The joint accounts with today's balance. */
export async function listJointAccounts(householdId: string): Promise<JointAccount[]> {
  const now = today();
  const accounts = await loadAccounts(householdId);
  const ledgers = await buildLedgers(householdId, accounts, now);
  return accounts.map((row) => toAccount(row, ledgers.get(row.id) ?? [], now));
}

export async function getMoneyMonth(householdId: string, month: string): Promise<MoneyMonth> {
  const now = today();
  const { from, to } = monthBounds(month);
  const accounts = await loadAccounts(householdId);
  const [ledgers, incomeMonth, planRows, extras, expenses, vouchers] = await Promise.all([
    buildLedgers(householdId, accounts, now),
    getIncomeMonth(householdId, month),
    db.contributionPlan.findMany({ where: { householdId }, orderBy: [{ activeFrom: "asc" }] }),
    db.contributionExtra.findMany({ where: { householdId, month } }),
    listExpensesBetween(householdId, from, to),
    getVoucherBalances(householdId),
  ]);
  // After listExpensesBetween: both top up recurring expenses, never at the same time.
  const jointFlow = await listExpenseFlow(householdId, from, to, { payer: "joint" });

  // The month's contributions from the ledgers: also those a later correction absorbed (they still count for the plan).
  const contributionInputs: ContributionInput[] = [];
  for (const lines of ledgers.values()) {
    const absorbed = absorbedKeys(lines);
    for (const line of lines) {
      if (line.type !== "contribution" || line.date < from || line.date > to) continue;
      contributionInputs.push({
        id: line.sourceId,
        habitantId: line.habitantId,
        accountId: line.accountId,
        date: line.date,
        amountCents: line.amountCents,
        note: line.note,
        absorbed: absorbed.has(line.key),
        counterpartHabitantId: line.counterpartHabitantId ?? null,
      });
    }
  }

  const toEnter = new Map<string, number>();
  for (const occurrence of incomeMonth.occurrences) {
    if (occurrence.status !== "to_enter") continue;
    const key = occurrence.habitantId ?? "joint";
    toEnter.set(key, (toEnter.get(key) ?? 0) + 1);
  }
  const people: MoneyIncomeRow[] = incomeMonth.totals.people.map((total) => ({ ...total, toEnterCount: toEnter.get(total.key) ?? 0 }));
  for (const [key, count] of toEnter) {
    if (!people.some((row) => row.key === key)) people.push({ key, receivedCents: 0, expectedCents: 0, totalCents: 0, toEnterCount: count });
  }

  const inMonth = (date: string | null) => date !== null && date >= from && date <= to;
  const joint = expenses.filter((expense) => expense.payerType === "joint" && (inMonth(expense.dueDate) || inMonth(expense.paidOn)));
  const plans = planRows.map(toPlan);

  return {
    today: now,
    month,
    accounts: accounts.map((row) => toAccount(row, ledgers.get(row.id) ?? [], now)),
    accountMonths: accounts.map((row) => summarizeMonth(row.id, ledgers.get(row.id) ?? [], month, now)),
    income: {
      people,
      household: { ...incomeMonth.totals.household, toEnterCount: [...toEnter.values()].reduce((sum, count) => sum + count, 0) },
      vouchersCents: incomeMonth.totals.vouchersCents,
    },
    plans,
    contributions: contributionRows(
      plans,
      contributionInputs,
      month,
      extras.map((extra) => ({ habitantId: extra.habitantId, accountId: extra.accountId, month: extra.month, amountCents: extra.amountCents })),
    ),
    jointOutgoings: {
      items: joint.map((expense) => ({
        id: expense.id,
        payee: expense.payee,
        amountCents: expense.amountCents,
        dueDate: expense.dueDate,
        paidOn: expense.paidOn,
        category: expense.category,
      })),
      paidCents: joint.filter((expense) => inMonth(expense.paidOn)).reduce((sum, expense) => sum + expense.amountCents, 0),
      upcomingCents: joint.filter((expense) => !expense.paidOn && inMonth(expense.dueDate)).reduce((sum, expense) => sum + expense.amountCents, 0),
    },
    jointCosts: jointCostsOfMonth(jointFlow, month),
    vouchers,
  };
}

/** The dashboard's money card: this month in and out, and the joint balances. */
export async function getMoneySummary(householdId: string): Promise<MoneySummary> {
  const now = today();
  const month = monthOf(now);
  const { from, to } = monthBounds(month);
  const [accounts, incomeMonth, expenses] = await Promise.all([
    listJointAccounts(householdId),
    getIncomeMonth(householdId, month),
    listExpensesBetween(householdId, from, to),
  ]);
  const due = expenses.filter((expense) => expense.dueDate >= from && expense.dueDate <= to);
  const refs = accounts.map((account) => ({ ...account, createdAt: "" }));
  const jointAccount = defaultJointAccount(refs);
  const savings = accounts.find((account) => account.kind === "savings" && !account.archived);
  return {
    today: now,
    month,
    incomeCents: incomeMonth.totals.household.totalCents,
    incomeReceivedCents: incomeMonth.totals.household.receivedCents,
    outCents: due.reduce((sum, expense) => sum + expense.amountCents, 0),
    outPaidCents: due.filter((expense) => expense.paidOn).reduce((sum, expense) => sum + expense.amountCents, 0),
    jointBalanceCents: jointAccount ? (accounts.find((account) => account.id === jointAccount.id)?.balanceCents ?? null) : null,
    savingsBalanceCents: savings?.balanceCents ?? null,
  };
}

/** Loans and down payments with what is still open (expenses feature), and their totals. */
export async function getMoneyLoans(householdId: string): Promise<MoneyLoans> {
  const loans = await getLoanSummaries(householdId);
  return { today: today(), loans, totals: loanTotals(loans) };
}

/**
 * Income and expenses per month from `from` to `to` (`YYYY-MM`): actual figures for past months, projections
 * for the rest (see `buildMoneyTimeline`). Computed on every read.
 */
export async function getMoneyTimeline(householdId: string, from: string, to: string): Promise<MoneyTimeline> {
  const now = today();
  const start = `${from}-01`;
  const end = monthBounds(to).to;
  const [incomes, expenses] = await Promise.all([listIncomeFlow(householdId, start, end), listExpenseFlow(householdId, start, end)]);
  return { today: now, from, to, months: buildMoneyTimeline({ from, to, today: now, incomes, expenses }) };
}

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────────

async function findOwnAccount(householdId: string, id: string) {
  const row = await db.paymentAccount.findFirst({ where: { id, householdId, kind: { in: [...JOINT_KINDS] } }, include: accountInclude });
  if (!row) throw notFound("Account not found");
  return row;
}

async function assertHabitants(householdId: string, ids: readonly string[], field: string) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db.habitant.count({ where: { householdId, id: { in: unique } } });
  if (found !== unique.length) throw badRequest("Validation failed", { [field]: ["Unknown habitant"] });
}

// ── Mutations: accounts ─────────────────────────────────────────────────────────────────────────────

/** Creates a joint account with its opening balance as the first correction. */
export async function createAccount(householdId: string, userId: string, input: AccountCreateInput): Promise<JointAccount> {
  await assertHabitants(householdId, input.ownerIds, "ownerIds");
  const kind = input.kind === "savings" ? "SAVINGS" : "JOINT";
  const opening = input.negative ? -input.openingBalanceCents : input.openingBalanceCents;
  const hasDefault = kind === "JOINT" && (await db.paymentAccount.count({ where: { householdId, kind: "JOINT", isDefault: true, archived: false } })) > 0;
  const existing = await db.paymentAccount.count({ where: { householdId } });
  const row = await db.paymentAccount.create({
    data: {
      householdId,
      name: input.name,
      kind,
      iban: input.iban ?? null,
      color: input.color ?? ACCOUNT_COLORS[existing % ACCOUNT_COLORS.length] ?? ACCOUNT_COLORS[0],
      icon: kind === "SAVINGS" ? "piggy-bank" : "wallet",
      isDefault: kind === "JOINT" && !hasDefault,
      owners: { create: input.ownerIds.map((habitantId, position) => ({ habitantId, position })) },
      entries: {
        create: [
          {
            householdId,
            date: toDate(input.openingDate),
            type: "CORRECTION",
            amountCents: opening,
            balanceCents: opening,
            createdById: userId,
          },
        ],
      },
    },
    include: accountInclude,
  });
  return accountWithBalance(householdId, row.id);
}

/** One account with its balance; the ledgers of all accounts are needed to know the default joint account. */
async function accountWithBalance(householdId: string, id: string): Promise<JointAccount> {
  const account = (await listJointAccounts(householdId)).find((item) => item.id === id);
  if (!account) throw notFound("Account not found");
  return account;
}

export async function updateAccount(householdId: string, id: string, input: AccountUpdateInput): Promise<JointAccount> {
  const existing = await findOwnAccount(householdId, id);
  await assertHabitants(householdId, input.ownerIds, "ownerIds");
  const makeDefault = existing.kind === "JOINT" && input.isDefault === true && !input.archived;
  await db.$transaction(async (tx) => {
    if (makeDefault) await tx.paymentAccount.updateMany({ where: { householdId, kind: "JOINT", id: { not: id } }, data: { isDefault: false } });
    await tx.paymentAccountOwner.deleteMany({ where: { accountId: id } });
    await tx.paymentAccount.update({
      where: { id },
      data: {
        name: input.name,
        iban: input.iban ?? null,
        color: input.color ?? existing.color,
        isDefault: existing.kind === "JOINT" && !input.archived && input.isDefault,
        archived: input.archived,
        owners: { create: input.ownerIds.map((habitantId, position) => ({ habitantId, position })) },
      },
    });
  });
  return accountWithBalance(householdId, id);
}

// ── Mutations: ledger ───────────────────────────────────────────────────────────────────────────────

/**
 * "Set real balance": a CORRECTION that sets the balance on `date`. It stores the balance it set and the
 * difference with what the app had at that moment (the history recomputes the difference when earlier lines
 * change later).
 */
export async function setBalance(householdId: string, userId: string, accountId: string, input: SetBalanceInput, actor?: AuditActor): Promise<void> {
  const account = await findOwnAccount(householdId, accountId);
  const ledgers = await buildLedgers(householdId, await loadAccounts(householdId), today());
  const before = balanceAt(ledgers.get(accountId) ?? [], input.date);
  const balance = input.negative ? -input.balanceCents : input.balanceCents;
  const entry = await db.accountEntry.create({
    data: {
      householdId,
      accountId,
      date: toDate(input.date),
      type: "CORRECTION",
      amountCents: balance - before,
      balanceCents: balance,
      note: input.note,
      createdById: userId,
    },
  });
  if (actor) {
    const difference = balance - before;
    await audit(actor, {
      action: "payment_account.corrected",
      targetType: "payment_account",
      targetId: accountId,
      targetLabel: account.name,
      summary: `${formatDate(input.date, "en")}: set to ${auditEuros(balance)} (${difference >= 0 ? "+" : "−"}${auditEuros(Math.abs(difference))}) · entry ${entry.id}`,
    });
  }
}

const auditEuros = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * "Record transfer": from a person (a CONTRIBUTION on the receiving account) or from another joint account
 * (a TRANSFER: one entry on each side with the same transfer id).
 */
export async function recordTransfer(householdId: string, userId: string, input: RecordTransferInput): Promise<void> {
  const from = parseTransferFrom(input.from);
  if (!from) throw badRequest("Validation failed", { from: ["Choose where the money comes from"] });
  await findOwnAccount(householdId, input.toAccountId);
  const common = { householdId, date: toDate(input.date), note: input.note, createdById: userId };

  if ("habitantId" in from) {
    await assertHabitants(householdId, [from.habitantId], "from");
    await db.accountEntry.create({
      data: { ...common, accountId: input.toAccountId, type: "CONTRIBUTION", amountCents: input.amountCents, habitantId: from.habitantId },
    });
    return;
  }

  await findOwnAccount(householdId, from.accountId);
  const transferId = randomUUID();
  await db.accountEntry.createMany({
    data: [
      { ...common, accountId: from.accountId, type: "TRANSFER", amountCents: -input.amountCents, counterpartAccountId: input.toAccountId, transferId },
      { ...common, accountId: input.toAccountId, type: "TRANSFER", amountCents: input.amountCents, counterpartAccountId: from.accountId, transferId },
    ],
  });
}

/** Other money in or out of an account (interest, a withdrawal…). */
export async function addOtherEntry(householdId: string, userId: string, accountId: string, input: OtherEntryInput): Promise<void> {
  await findOwnAccount(householdId, accountId);
  await db.accountEntry.create({
    data: {
      householdId,
      accountId,
      date: toDate(input.date),
      type: input.direction === "in" ? "INCOME" : "OTHER",
      amountCents: input.direction === "in" ? input.amountCents : -input.amountCents,
      note: input.note,
      createdById: userId,
    },
  });
}

// ── Mutations: settling the month's contributions ───────────────────────────────────────────────────

/**
 * "Take back": a person takes an over-contribution back out of the account. A negative CONTRIBUTION of that
 * person: it lowers the balance like a withdrawal and their net transferred amount for the month.
 */
export async function takeBackContribution(householdId: string, userId: string, input: TakeBackInput): Promise<void> {
  await findOwnAccount(householdId, input.accountId);
  await assertHabitants(householdId, [input.habitantId], "habitantId");
  await db.accountEntry.create({
    data: {
      householdId,
      accountId: input.accountId,
      date: toDate(input.date),
      type: "CONTRIBUTION",
      amountCents: -input.amountCents,
      habitantId: input.habitantId,
      note: input.note,
      createdById: userId,
    },
  });
}

/** "Keep as extra": up to `amountCents` of the person's surplus in the month is intentional; 0 flags it again. */
export async function setKeptExtra(householdId: string, userId: string, input: KeepExtraInput): Promise<void> {
  await findOwnAccount(householdId, input.accountId);
  await assertHabitants(householdId, [input.habitantId], "habitantId");
  const where = { householdId, habitantId: input.habitantId, accountId: input.accountId, month: input.month };
  if (input.amountCents === 0) {
    await db.contributionExtra.deleteMany({ where });
    return;
  }
  await db.contributionExtra.upsert({
    where: { householdId_habitantId_accountId_month: where },
    create: { ...where, amountCents: input.amountCents, createdById: userId },
    update: { amountCents: input.amountCents },
  });
}

/**
 * The netting alternative: one person paid another directly. Two CONTRIBUTION entries with one transfer id
 * (+ for who paid, − for who received): the balance stays the same, the net amounts per person move. Deleting
 * one line deletes both.
 */
export async function recordDirectPayment(householdId: string, userId: string, input: DirectPaymentInput): Promise<void> {
  await findOwnAccount(householdId, input.accountId);
  await assertHabitants(householdId, [input.fromHabitantId, input.toHabitantId], "fromHabitantId");
  const transferId = randomUUID();
  const common = { householdId, accountId: input.accountId, date: toDate(input.date), type: "CONTRIBUTION" as const, transferId, createdById: userId };
  await db.accountEntry.createMany({
    data: [
      { ...common, amountCents: input.amountCents, habitantId: input.fromHabitantId },
      { ...common, amountCents: -input.amountCents, habitantId: input.toHabitantId },
    ],
  });
}

/** "Update plans": new monthly amounts from the first day of the month; earlier months keep their plan. */
export async function setPlanAmounts(householdId: string, input: PlanAmountsInput): Promise<void> {
  const monthStart = `${input.month}-01`;
  const rows = await db.contributionPlan.findMany({ where: { householdId, id: { in: input.amounts.map((item) => item.planId) } } });
  if (rows.length !== new Set(input.amounts.map((item) => item.planId)).size) throw notFound("Plan not found");
  for (const item of input.amounts) {
    const plan = toPlan(rows.find((row) => row.id === item.planId) as PlanRow);
    if (plan.amountCents === item.amountCents) continue;
    await updatePlan(householdId, plan.id, {
      habitantId: plan.habitantId,
      accountId: plan.accountId,
      amountCents: item.amountCents,
      dayOfMonth: plan.dayOfMonth,
      activeFrom: plan.activeFrom > monthStart ? plan.activeFrom : monthStart,
      activeTo: plan.activeTo,
      note: plan.note,
    });
  }
}

/** Deletes a ledger entry; both sides of a transfer go together. An account keeps at least one correction. */
export async function deleteEntry(householdId: string, id: string, actor?: AuditActor): Promise<void> {
  const entry = await db.accountEntry.findFirst({ where: { id, householdId }, include: { account: { select: { name: true } } } });
  if (!entry) throw notFound("Entry not found");
  if (entry.type === "CORRECTION") {
    const corrections = await db.accountEntry.count({ where: { accountId: entry.accountId, type: "CORRECTION" } });
    if (corrections <= 1) throw conflict("The opening balance can't be deleted; set the real balance instead");
  }
  if (entry.transferId) await db.accountEntry.deleteMany({ where: { householdId, transferId: entry.transferId } });
  else await db.accountEntry.delete({ where: { id } });
  if (actor && entry.type === "CORRECTION") {
    await audit(actor, {
      action: "payment_account.correction_deleted",
      targetType: "payment_account",
      targetId: entry.accountId,
      targetLabel: entry.account.name,
      summary: `${formatDate(fromDate(entry.date), "en")}: set to ${auditEuros(entry.balanceCents ?? 0)} · entry ${entry.id}`,
    });
  }
}

// ── Mutations: contribution plans ───────────────────────────────────────────────────────────────────

export async function createPlan(householdId: string, input: ContributionPlanInput): Promise<ContributionPlan> {
  await assertHabitants(householdId, [input.habitantId], "habitantId");
  await findOwnAccount(householdId, input.accountId);
  const row = await db.contributionPlan.create({
    data: {
      householdId,
      habitantId: input.habitantId,
      accountId: input.accountId,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      activeFrom: toDate(input.activeFrom),
      activeTo: input.activeTo ? toDate(input.activeTo) : null,
      note: input.note,
    },
  });
  return toPlan(row);
}

/**
 * Edits a plan. A new amount that applies from a later date than the plan's start ends the plan the day
 * before and starts a new one, so the months before keep their planned amount.
 */
export async function updatePlan(householdId: string, id: string, input: ContributionPlanInput): Promise<ContributionPlan> {
  const existing = await db.contributionPlan.findFirst({ where: { id, householdId } });
  if (!existing) throw notFound("Plan not found");
  await assertHabitants(householdId, [input.habitantId], "habitantId");
  await findOwnAccount(householdId, input.accountId);
  const data = {
    habitantId: input.habitantId,
    accountId: input.accountId,
    amountCents: input.amountCents,
    dayOfMonth: input.dayOfMonth,
    activeFrom: toDate(input.activeFrom),
    activeTo: input.activeTo ? toDate(input.activeTo) : null,
    note: input.note,
  };
  const startedBefore = fromDate(existing.activeFrom) < input.activeFrom;
  if (existing.amountCents !== input.amountCents && startedBefore) {
    const row = await db.$transaction(async (tx) => {
      await tx.contributionPlan.update({ where: { id }, data: { activeTo: toDate(addDays(input.activeFrom, -1)) } });
      return tx.contributionPlan.create({ data: { householdId, ...data } });
    });
    return toPlan(row);
  }
  return toPlan(await db.contributionPlan.update({ where: { id }, data }));
}

export async function deletePlan(householdId: string, id: string): Promise<void> {
  const existing = await db.contributionPlan.findFirst({ where: { id, householdId } });
  if (!existing) throw notFound("Plan not found");
  await db.contributionPlan.delete({ where: { id } });
}
