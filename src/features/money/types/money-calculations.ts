import { addDays, addMonthsClamped, monthOf } from "@/types/dates";
import type { AccountKind, AccountMonth, ContributionPlan, ContributionRow, LedgerLine } from "./money";

/** Pure calculations for the joint accounts, shared by the API, the screens and the tests. */

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(addMonthsClamped(from, 1), -1) };
}

/** A day of the month, clamped to the month's last day (31 → 30 April). */
export function dayInMonth(month: string, day: number): string {
  const { to } = monthBounds(month);
  const last = Number(to.slice(8, 10));
  return `${month}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

/** A ledger line before the running balance is known. Corrections carry `setBalanceCents`. */
export type LedgerItem = Omit<LedgerLine, "balanceAfterCents" | "future"> & {
  /**
   * When it was recorded (ISO): orders items of the same day. For a paid expense the moment it was marked
   * paid (its last change), for an income or entry when it was created.
   */
  createdAt: string;
};

/** Chronological order: by date, and on one day in the order things were recorded. */
export function sortLedger<T extends LedgerItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.key.localeCompare(b.key));
}

const before = (a: LedgerItem, b: LedgerItem) => a.date < b.date || (a.date === b.date && a.createdAt < b.createdAt);

/**
 * Computed items (paid joint expenses, incomes) from before the account's first correction are already part
 * of the balance that correction (the opening balance) set: leave them out.
 */
export function dropBeforeOpening(items: readonly LedgerItem[]): LedgerItem[] {
  const firstCorrection = sortLedger(items).find((item) => item.type === "correction");
  if (!firstCorrection) return [...items];
  return items.filter((item) => item.source === "entry" || !before(item, firstCorrection));
}

/**
 * Runs the ledger of one account: every item adds its amount, a correction sets the balance (its amount
 * becomes the difference with the balance just before it). So the balance is always the latest correction
 * plus everything after it. On the correction's own day, what was recorded before it is absorbed (it is in
 * the real balance already); what is recorded after it counts.
 */
export function runLedger(items: readonly LedgerItem[], today: string): LedgerLine[] {
  let balance = 0;
  return sortLedger(items).map(({ createdAt: _createdAt, ...item }) => {
    if (item.type === "correction" && item.setBalanceCents !== null) {
      const difference = item.setBalanceCents - balance;
      balance = item.setBalanceCents;
      return { ...item, amountCents: difference, balanceAfterCents: balance, future: item.date > today };
    }
    balance += item.amountCents;
    return { ...item, balanceAfterCents: balance, future: item.date > today };
  });
}

/** The balance at the end of `date`: after the last line on or before it; 0 before the first line. */
export function balanceAt(lines: readonly LedgerLine[], date: string): number {
  let balance = 0;
  for (const line of lines) {
    if (line.date > date) break;
    balance = line.balanceAfterCents;
  }
  return balance;
}

/** The latest correction on or before `date`. */
export function lastCorrectionAt(lines: readonly LedgerLine[], date: string): { date: string; balanceCents: number } | null {
  let found: { date: string; balanceCents: number } | null = null;
  for (const line of lines) {
    if (line.date > date) break;
    if (line.type === "correction" && line.setBalanceCents !== null) found = { date: line.date, balanceCents: line.setBalanceCents };
  }
  return found;
}

/**
 * One account's month: opening and closing balance, money in and out, and the month's lines (newest first).
 * In and out count what happened by `today`; lines dated later (a future-dated income, an entry planned
 * ahead) are planned in and out: they only count from their date on.
 */
export function summarizeMonth(accountId: string, lines: readonly LedgerLine[], month: string, today: string): AccountMonth {
  const { from, to } = monthBounds(month);
  const monthLines = lines.filter((line) => line.date >= from && line.date <= to);
  let inCents = 0;
  let outCents = 0;
  let plannedInCents = 0;
  let plannedOutCents = 0;
  let correctionsCents = 0;
  for (const line of monthLines) {
    const future = line.date > today;
    if (line.type === "correction") correctionsCents += line.amountCents;
    else if (line.amountCents >= 0) {
      if (future) plannedInCents += line.amountCents;
      else inCents += line.amountCents;
    } else if (future) plannedOutCents += -line.amountCents;
    else outCents += -line.amountCents;
  }
  // The current month closes today; past months at their end; future months with what is recorded for them.
  const closingDate = from <= today && today <= to ? today : to;
  return {
    accountId,
    openingCents: balanceAt(lines, addDays(from, -1)),
    closingCents: balanceAt(lines, closingDate),
    inCents,
    outCents,
    plannedInCents,
    plannedOutCents,
    correctionsCents,
    lines: [...monthLines].reverse(),
  };
}

type AccountRef = { id: string; kind: AccountKind; isDefault: boolean; archived: boolean; createdAt: string };

/** The joint current account joint expenses are paid from by default: the one marked default, else the oldest. */
export function defaultJointAccount<T extends AccountRef>(accounts: readonly T[]): T | null {
  const joint = accounts.filter((account) => account.kind === "joint" && !account.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return joint.find((account) => account.isDefault) ?? joint[0] ?? null;
}

/**
 * Which account a paid joint expense is taken from: its own payment account when that is one of the joint
 * accounts, else the default joint account (`null` when there is none: then it counts nowhere).
 */
export function accountForJointExpense(paymentAccountId: string | null, accounts: readonly AccountRef[]): string | null {
  if (paymentAccountId && accounts.some((account) => account.id === paymentAccountId)) return paymentAccountId;
  return defaultJointAccount(accounts)?.id ?? null;
}

/** Whether a plan applies in (part of) the month. */
export function planActiveIn(plan: Pick<ContributionPlan, "activeFrom" | "activeTo">, month: string): boolean {
  const { from, to } = monthBounds(month);
  return plan.activeFrom <= to && (!plan.activeTo || plan.activeTo >= from);
}

/** A recorded contribution as `contributionRows` needs it (negative: taken back). */
export type ContributionInput = {
  habitantId: string | null;
  accountId: string;
  date: string;
  amountCents: number;
  id?: string;
  note?: string | null;
  absorbed?: boolean;
  counterpartHabitantId?: string | null;
};

/**
 * Planned vs recorded contributions in a month, per person and account. A plan that changed during the
 * month counts with the plan in force on its planned day (the latest one that started). Recorded
 * contributions without a plan get a row too. Contributions count in the month of their date, also when a
 * correction later absorbed them (they still fulfil the plan). `extras` are the surpluses kept on purpose.
 */
export function contributionRows(
  plans: readonly ContributionPlan[],
  contributions: readonly ContributionInput[],
  month: string,
  extras: readonly { habitantId: string; accountId: string; month: string; amountCents: number }[] = [],
): ContributionRow[] {
  const rows = new Map<string, ContributionRow>();
  const keyOf = (habitantId: string, accountId: string) => `${habitantId}|${accountId}`;
  const empty = (habitantId: string, accountId: string): ContributionRow => ({
    habitantId,
    accountId,
    planId: null,
    plannedCents: 0,
    plannedDate: null,
    recordedCents: 0,
    remainingCents: 0,
    entries: [],
    keptExtraCents: 0,
  });

  const active = plans.filter((plan) => planActiveIn(plan, month)).sort((a, b) => a.activeFrom.localeCompare(b.activeFrom));
  for (const plan of active) {
    // Later plans replace earlier ones for the same person and account.
    rows.set(keyOf(plan.habitantId, plan.accountId), {
      ...empty(plan.habitantId, plan.accountId),
      planId: plan.id,
      plannedCents: plan.amountCents,
      plannedDate: dayInMonth(month, plan.dayOfMonth),
    });
  }
  const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
  for (const entry of sorted) {
    if (!entry.habitantId || monthOf(entry.date) !== month) continue;
    const key = keyOf(entry.habitantId, entry.accountId);
    const row = rows.get(key) ?? empty(entry.habitantId, entry.accountId);
    row.recordedCents += entry.amountCents;
    row.entries.push({
      id: entry.id ?? "",
      date: entry.date,
      amountCents: entry.amountCents,
      note: entry.note ?? null,
      absorbed: entry.absorbed ?? false,
      counterpartHabitantId: entry.counterpartHabitantId ?? null,
    });
    rows.set(key, row);
  }
  for (const extra of extras) {
    if (extra.month !== month) continue;
    const row = rows.get(keyOf(extra.habitantId, extra.accountId));
    if (row) row.keptExtraCents = extra.amountCents;
  }
  return [...rows.values()].map((row) => ({ ...row, remainingCents: Math.max(0, row.plannedCents - row.recordedCents) }));
}

/**
 * Keys of the lines a later correction absorbed: everything before an account's last correction (in ledger
 * order) is part of the real balance that correction set, so it no longer changes the balance.
 */
export function absorbedKeys(lines: readonly LedgerLine[]): Set<string> {
  let last = -1;
  lines.forEach((line, index) => {
    if (line.type === "correction") last = index;
  });
  return new Set(lines.slice(0, Math.max(0, last)).map((line) => line.key));
}

/** `habitant:<id>` / `account:<id>` of the "Record transfer" form. */
export function parseTransferFrom(from: string): { habitantId: string } | { accountId: string } | null {
  const [kind, id] = from.split(":");
  if (!id) return null;
  if (kind === "habitant") return { habitantId: id };
  if (kind === "account") return { accountId: id };
  return null;
}
