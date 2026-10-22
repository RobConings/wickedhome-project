import { addDays, addMonthsClamped, monthOf } from "@/types/dates";
import { expandRRule, nextOccurrence, parseRRule } from "@/types/recurrence";
import {
  INCOME_MONTH_END,
  INCOME_RRULE_SUPPORT,
  JOINT,
  VOUCHER_KIND,
  VOUCHER_VALID_MONTHS,
  VOUCHER_WARN_DAYS,
  type AmountMode,
  type Income,
  type IncomeAmountEntry,
  type IncomeKind,
  type IncomeMonthTotals,
  type IncomeOccurrence,
  type IncomeTotal,
  type VoucherBalance,
} from "./income";

/** Pure calculations on incomes, shared by the API and the screens. */

/** First and last day of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(addMonthsClamped(from, 1), -1) };
}

/** `YYYY-MM` plus or minus whole months. */
export const shiftMonth = (month: string, months: number) => monthOf(addMonthsClamped(`${month}-01`, months));

/**
 * The amount of a fixed source on `date`: the latest history entry effective on or before it. Before the
 * first entry the first amount applies (a source always starts with one); `null` without any.
 */
export function amountOn(amounts: readonly Pick<IncomeAmountEntry, "effectiveFrom" | "amountCents">[], date: string): number | null {
  const sorted = [...amounts].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let found: number | null = sorted[0]?.amountCents ?? null;
  for (const entry of sorted) {
    if (entry.effectiveFrom <= date) found = entry.amountCents;
  }
  return found;
}

/** The history entry in force on `date` (for "from 1 Jan: € 2.450"). */
export function amountEntryOn<T extends Pick<IncomeAmountEntry, "effectiveFrom">>(amounts: readonly T[], date: string): T | null {
  const sorted = [...amounts].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let found: T | null = sorted[0] ?? null;
  for (const entry of sorted) if (entry.effectiveFrom <= date) found = entry;
  return found;
}

type Schedule = { rrule: string; startDate: string; endDate: string | null };

/** Occurrence dates of a source in [from, to], within its end date. */
export function occurrencesBetween(source: Schedule, from: string, to: string): string[] {
  const rule = parseRRule(source.rrule, INCOME_RRULE_SUPPORT);
  const last = source.endDate && source.endDate < to ? source.endDate : to;
  if (last < from) return [];
  if (!rule) return source.startDate >= from && source.startDate <= last ? [source.startDate] : [];
  return expandRRule(rule, source.startDate, { from, to: last, monthEnd: INCOME_MONTH_END });
}

/** Next occurrence on or after `from`, or `null` once the source has ended. */
export function nextOccurrenceOf(source: Schedule, from: string): string | null {
  const rule = parseRRule(source.rrule, INCOME_RRULE_SUPPORT);
  if (!rule) return source.startDate >= from ? source.startDate : null;
  const next = nextOccurrence(rule, source.startDate, from, { monthEnd: INCOME_MONTH_END });
  return next && (!source.endDate || next <= source.endDate) ? next : null;
}

/** Times a year an RRULE occurs (weeks count as 52 a year); 0 when it can't be read. */
export function occurrencesPerYear(rrule: string): number {
  const rule = parseRRule(rrule, INCOME_RRULE_SUPPORT);
  if (!rule) return 0;
  const interval = Math.max(1, rule.interval);
  if (rule.freq === "WEEKLY") return 52 / interval;
  if (rule.freq === "MONTHLY") return 12 / interval;
  if (rule.freq === "YEARLY") return 1 / interval;
  return 0;
}

export type OccurrenceSource = Schedule & {
  id: string;
  name: string;
  kind: IncomeKind;
  habitantId: string | null;
  amountMode: AmountMode;
  estimateCents: number | null;
  targetAccountId: string | null;
  amounts: readonly Pick<IncomeAmountEntry, "effectiveFrom" | "amountCents">[];
};

/**
 * Whether a recorded income has come in by `today` (`YYYY-MM-DD`, the household's day, see `todayIn`): its
 * date is today or earlier. A later date (a tax return announced for the 30th) is still expected: it counts
 * as expected in the totals, not in a balance, and is projected in the timeline.
 */
export const isReceived = (income: Pick<Income, "date">, today: string) => income.date <= today;

/**
 * Planned occurrences of the sources in [from, to], each with the income recorded for it (same source and
 * period date). Recorded and dated today or earlier: "received"; recorded with a later date: "upcoming"
 * (still expected). Fixed occurrences without one are "expected", variable ones "to enter".
 */
export function buildOccurrences(
  sources: readonly OccurrenceSource[],
  incomes: readonly Income[],
  from: string,
  to: string,
  today: string,
): IncomeOccurrence[] {
  const recorded = new Map<string, Income>();
  for (const income of incomes) {
    if (income.sourceId && income.periodDate) recorded.set(`${income.sourceId}|${income.periodDate}`, income);
  }
  return sources
    .flatMap((source) =>
      occurrencesBetween(source, from, to).map((date): IncomeOccurrence => {
        const income = recorded.get(`${source.id}|${date}`) ?? null;
        return {
          sourceId: source.id,
          name: source.name,
          kind: source.kind,
          habitantId: source.habitantId,
          amountMode: source.amountMode,
          date,
          plannedCents: source.amountMode === "fixed" ? amountOn(source.amounts, date) : source.estimateCents,
          targetAccountId: source.targetAccountId,
          income,
          status: income ? (isReceived(income, today) ? "received" : "upcoming") : source.amountMode === "fixed" ? "expected" : "to_enter",
        };
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/**
 * The month an income counts in: the month of the occurrence it fulfils (a salary for 31 October that came
 * in on 2 November still belongs to October), else the month it came in.
 */
export const incomeMonth = (income: Pick<Income, "date" | "periodDate">) => monthOf(income.periodDate ?? income.date);

/**
 * Totals of a month per person (and joint) and for the household, relative to `today`: recorded incomes
 * dated today or earlier (received), plus what is still expected: recorded incomes dated after today
 * (one-offs announced ahead, an amount entered early) and occurrences nothing was recorded for yet (fixed
 * amount or variable estimate). Meal vouchers are not money in the bank: those received by today are counted
 * separately in `vouchersCents`.
 */
export function monthTotals(month: string, occurrences: readonly IncomeOccurrence[], incomes: readonly Income[], today: string): IncomeMonthTotals {
  const byKey = new Map<string, IncomeTotal>();
  const vouchersCents: Record<string, number> = {};
  const totalFor = (habitantId: string | null) => {
    const key = habitantId ?? JOINT;
    let total = byKey.get(key);
    if (!total) {
      total = { key, receivedCents: 0, expectedCents: 0, totalCents: 0 };
      byKey.set(key, total);
    }
    return total;
  };

  for (const income of incomes) {
    if (incomeMonth(income) !== month) continue;
    const received = isReceived(income, today);
    if (income.kind === VOUCHER_KIND) {
      if (income.habitantId && received) vouchersCents[income.habitantId] = (vouchersCents[income.habitantId] ?? 0) + income.amountCents;
      continue;
    }
    if (received) totalFor(income.habitantId).receivedCents += income.amountCents;
    else totalFor(income.habitantId).expectedCents += income.amountCents;
  }
  for (const occurrence of occurrences) {
    if (occurrence.income || occurrence.kind === VOUCHER_KIND || monthOf(occurrence.date) !== month) continue;
    totalFor(occurrence.habitantId).expectedCents += occurrence.plannedCents ?? 0;
  }

  const people = [...byKey.values()].map((total) => ({ ...total, totalCents: total.receivedCents + total.expectedCents }));
  const household = people.reduce(
    (sum, total) => ({
      receivedCents: sum.receivedCents + total.receivedCents,
      expectedCents: sum.expectedCents + total.expectedCents,
      totalCents: sum.totalCents + total.totalCents,
    }),
    { receivedCents: 0, expectedCents: 0, totalCents: 0 },
  );
  return { people, household, vouchersCents };
}

/**
 * Recorded incomes of a month dated after `today` that no occurrence in `occurrences` shows (one-offs such as
 * a tax return announced for the 30th): the planned list shows them as "Expected 30/10/2026". Oldest first.
 */
export function upcomingIncomes(month: string, occurrences: readonly IncomeOccurrence[], incomes: readonly Income[], today: string): Income[] {
  const shown = new Set(occurrences.flatMap((occurrence) => (occurrence.income ? [occurrence.income.id] : [])));
  return incomes
    .filter((income) => incomeMonth(income) === month && !isReceived(income, today) && !shown.has(income.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Income as money coming into the household in a month (the money flow timeline). */
export type IncomeFlowItem = {
  /** `YYYY-MM-DD`: the occurrence it fulfils (else when it came in), or the planned date. */
  date: string;
  amountCents: number;
  received: boolean;
  /** Planned from a variable source's estimate (not entered yet). */
  estimate: boolean;
};

/**
 * Income between `from` and `to` (inclusive, `YYYY-MM-DD`), meal vouchers left out: recorded incomes (on the
 * date of the occurrence they fulfil, else their own date), received when dated today or earlier and
 * projected (not received) when dated later; and the occurrences nothing was recorded for yet from the start
 * of the current month on: fixed amounts from their history, variable ones at their estimate (none: left
 * out). Earlier occurrences that never came in don't count.
 */
export function incomeFlowItems(
  sources: readonly OccurrenceSource[],
  incomes: readonly Income[],
  from: string,
  to: string,
  today: string,
): IncomeFlowItem[] {
  const monthStart = `${monthOf(today)}-01`;
  const recorded = incomes.flatMap((income): IncomeFlowItem[] => {
    const received = isReceived(income, today);
    // Still to come in for a past period: it counts when it arrives, not in a month that is closed.
    const period = income.periodDate ?? income.date;
    const date = !received && period < monthStart ? income.date : period;
    return income.kind === VOUCHER_KIND || date < from || date > to ? [] : [{ date, amountCents: income.amountCents, received, estimate: false }];
  });
  const plannedFrom = from > monthStart ? from : monthStart;
  const planned =
    plannedFrom > to
      ? []
      : buildOccurrences(sources, incomes, plannedFrom, to, today).flatMap((occurrence): IncomeFlowItem[] =>
          occurrence.income || occurrence.kind === VOUCHER_KIND || !occurrence.plannedCents
            ? []
            : [{ date: occurrence.date, amountCents: occurrence.plannedCents, received: false, estimate: occurrence.amountMode === "variable" }],
        );
  return [...recorded, ...planned];
}

/**
 * What one habitant paid with meal vouchers for one expense (their whole expense, or their share of a split),
 * on the day it was paid.
 */
export type VoucherSpending = { habitantId: string; amountCents: number; date: string };

/** The last day meal vouchers credited on `date` can be used: the same date 12 months later (31st clamps). */
export const voucherExpiry = (date: string) => addMonthsClamped(date, VOUCHER_VALID_MONTHS);

type VoucherLot = { date: string; expiresOn: string; leftCents: number };

/**
 * Voucher balance per habitant on `today`, FIFO: every meal voucher income is a lot that can be used from its
 * date up to and including `voucherExpiry(date)`. Each payment (in date order) takes from the oldest lots that
 * are valid on its day; what no valid lot covers is `uncoveredCents`. Unspent lots past their last day are
 * expired. Incomes and payments after `today` are left out, as are habitants with neither.
 */
export function voucherBalances(
  incomes: readonly Pick<Income, "habitantId" | "kind" | "amountCents" | "date">[],
  spending: readonly VoucherSpending[],
  today: string,
  warnDays: number = VOUCHER_WARN_DAYS,
): VoucherBalance[] {
  const lotsByHabitant = new Map<string, VoucherLot[]>();
  const spendsByHabitant = new Map<string, VoucherSpending[]>();
  for (const income of incomes) {
    if (income.kind !== VOUCHER_KIND || !income.habitantId || income.date > today || income.amountCents <= 0) continue;
    const lots = lotsByHabitant.get(income.habitantId) ?? [];
    lots.push({ date: income.date, expiresOn: voucherExpiry(income.date), leftCents: income.amountCents });
    lotsByHabitant.set(income.habitantId, lots);
  }
  for (const spent of spending) {
    if (spent.amountCents <= 0 || spent.date > today) continue;
    spendsByHabitant.set(spent.habitantId, [...(spendsByHabitant.get(spent.habitantId) ?? []), spent]);
  }

  const habitantIds = [...new Set([...lotsByHabitant.keys(), ...spendsByHabitant.keys()])];
  return habitantIds.map((habitantId) => {
    const lots = (lotsByHabitant.get(habitantId) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const spends = (spendsByHabitant.get(habitantId) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const receivedCents = lots.reduce((sum, lot) => sum + lot.leftCents, 0);
    let spentCents = 0;
    let uncoveredCents = 0;
    for (const spend of spends) {
      spentCents += spend.amountCents;
      let need = spend.amountCents;
      for (const lot of lots) {
        if (need === 0 || lot.date > spend.date) break;
        if (lot.expiresOn < spend.date || lot.leftCents === 0) continue;
        const take = Math.min(lot.leftCents, need);
        lot.leftCents -= take;
        need -= take;
      }
      uncoveredCents += need;
    }

    let expiredCents = 0;
    const byExpiry = new Map<string, number>();
    for (const lot of lots) {
      if (lot.leftCents === 0) continue;
      if (lot.expiresOn < today) expiredCents += lot.leftCents;
      else byExpiry.set(lot.expiresOn, (byExpiry.get(lot.expiresOn) ?? 0) + lot.leftCents);
    }
    const expiries = [...byExpiry].sort(([a], [b]) => a.localeCompare(b)).map(([date, amountCents]) => ({ date, amountCents }));
    const availableCents = expiries.reduce((sum, expiry) => sum + expiry.amountCents, 0);
    const nextExpiry = expiries[0] ?? null;
    return {
      habitantId,
      receivedCents,
      spentCents,
      availableCents,
      expiredCents,
      uncoveredCents,
      balanceCents: availableCents - uncoveredCents,
      nextExpiry,
      expiringSoon: nextExpiry && nextExpiry.date <= addDays(today, warnDays) ? nextExpiry : null,
    };
  });
}
