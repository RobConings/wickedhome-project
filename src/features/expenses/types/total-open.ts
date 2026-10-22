import { addDays } from "@/types/dates";
import { MAX_COUNT, expandRRule, formatRRule, parseRRule, type RRule } from "@/types/recurrence";
import { EXPENSE_MONTH_END, EXPENSE_RRULE_SUPPORT, type ExpenseShare } from "./expenses";

/*
 * Loans and down payments: "total still open"
 * ───────────────────────────────────────────
 * A recurring expense can carry the amount still to pay off (`totalOpenCents`) counted from a due date
 * (`totalOpenAsOf`). Payments of `amountCents` follow the template's rhythm from that date on; the last one
 * is for what is left, so the series ends after N = ceil(open / amount) payments and the last payment is
 * open − amount × (N − 1) (more than 0, at most one payment).
 *
 * Instances that already exist with an amount that stays (paid ones, and unpaid ones that are not being
 * regenerated) are *settled*: they count with their own amount and their dates are skipped. The plan then
 * walks the rule's occurrences from `from` on for what is left. With nothing settled this is exactly the
 * formula above. The rule's end is stored as UNTIL = the last payment's date, so every reader of the RRULE
 * (next due date, calendar, other features) stops there too.
 *
 * Pure: shared by the API (generation, calendar, progress, money timeline) and the form's preview.
 */

/** A loan longer than this many payments is refused (same cap as an RRULE COUNT). */
export const MAX_TOTAL_OPEN_PAYMENTS = MAX_COUNT;

export type DatedAmount = { dueDate: string; amountCents: number };

/** N payments of `amountCents`, the last one for what is left. `null` for amounts that can't be planned. */
export function splitTotalOpen(amountCents: number, totalOpenCents: number): { count: number; lastCents: number } | null {
  if (!Number.isInteger(amountCents) || !Number.isInteger(totalOpenCents) || amountCents <= 0 || totalOpenCents <= 0) return null;
  const count = Math.ceil(totalOpenCents / amountCents);
  return { count, lastCents: totalOpenCents - amountCents * (count - 1) };
}

/** The rule without COUNT / UNTIL: the rhythm a total open amount is planned on. */
export function baseRuleOf(rrule: string): RRule | null {
  const rule = parseRRule(rrule, EXPENSE_RRULE_SUPPORT);
  if (!rule) return null;
  const { count: _count, until: _until, ...base } = rule;
  return base;
}

/** The RRULE ending on `until` (COUNT and an earlier UNTIL dropped). */
export function withUntil(rrule: string, until: string | null): string {
  const base = baseRuleOf(rrule);
  if (!base) return rrule;
  return formatRRule(until ? { ...base, until } : base);
}

export type TotalOpenPlanInput = {
  /** Regular payment. */
  amountCents: number;
  totalOpenCents: number;
  /** First due date that counts. */
  asOf: string;
  rrule: string;
  /** DTSTART of the template. */
  startDate: string;
  /** Plan payments from this date on (default `asOf`); earlier dates are settled or left out. */
  from?: string;
  /** Instances with an amount that stays (due on or after `asOf`; others are ignored). */
  settled?: readonly DatedAmount[];
};

export type TotalOpenPlan = {
  /** Total open − settled amounts, never below 0. */
  remainingCents: number;
  /** Payments still to make on the rule's dates from `from` on, soonest first; the last may be partial. */
  payments: DatedAmount[];
  /** Date of the very last payment (planned, else the last settled one); `null` when there is none. */
  lastDate: string | null;
  /** More payments needed than MAX_TOTAL_OPEN_PAYMENTS (only the first ones are listed). */
  tooMany: boolean;
};

/** Plans the payments that pay off what is still open. See the comment at the top of this file. */
export function planTotalOpen({ amountCents, totalOpenCents, asOf, rrule, startDate, from, settled = [] }: TotalOpenPlanInput): TotalOpenPlan {
  const counted = settled.filter((item) => item.dueDate >= asOf);
  const settledCents = counted.reduce((sum, item) => sum + item.amountCents, 0);
  const remainingCents = Math.max(0, totalOpenCents - settledCents);
  const lastSettled = counted.reduce<string | null>((last, item) => (last === null || item.dueDate > last ? item.dueDate : last), null);
  const rule = baseRuleOf(rrule);
  if (!rule || amountCents <= 0 || remainingCents === 0) return { remainingCents, payments: [], lastDate: lastSettled, tooMany: false };

  const needed = Math.ceil(remainingCents / amountCents);
  const tooMany = needed > MAX_TOTAL_OPEN_PAYMENTS;
  const wanted = Math.min(needed, MAX_TOTAL_OPEN_PAYMENTS);
  const start = from && from > asOf ? from : asOf;
  const skip = new Set(counted.map((item) => item.dueDate));
  const dates = expandRRule(rule, startDate, {
    from: start,
    to: "2999-12-31",
    limit: wanted + skip.size,
    monthEnd: EXPENSE_MONTH_END,
  })
    .filter((date) => !skip.has(date))
    .slice(0, wanted);

  let left = remainingCents;
  const payments = dates.map((dueDate) => {
    const amount = Math.min(amountCents, left);
    left -= amount;
    return { dueDate, amountCents: amount };
  });
  const lastPlanned = payments.at(-1)?.dueDate ?? null;
  const lastDate = lastPlanned && (!lastSettled || lastPlanned > lastSettled) ? lastPlanned : lastSettled;
  return { remainingCents, payments, lastDate, tooMany };
}

/**
 * Shares of a split scaled to another total (the partial last payment), cent-exact: each share is rounded
 * down and the leftover cents go to the first habitants, so they always add up to `totalCents`.
 */
export function scaleShares(shares: readonly ExpenseShare[], fromCents: number, totalCents: number): ExpenseShare[] {
  if (shares.length === 0) return [];
  if (fromCents <= 0) return shares.map((share, index) => ({ ...share, amountCents: index === 0 ? totalCents : 0 }));
  const scaled = shares.map((share) => ({ ...share, amountCents: Math.floor((share.amountCents * totalCents) / fromCents) }));
  let leftover = totalCents - scaled.reduce((sum, share) => sum + share.amountCents, 0);
  for (let index = 0; leftover > 0; index = (index + 1) % scaled.length, leftover -= 1) {
    const share = scaled[index];
    if (share) share.amountCents += 1;
  }
  return scaled;
}

/** Progress of a loan: what is paid, what is left, how many payments to go and when the last one is. */
export type TotalOpenProgress = {
  totalCents: number;
  /** `YYYY-MM-DD` */
  asOf: string;
  /** Paid instances due on or after `asOf`. */
  paidCents: number;
  paidCount: number;
  /** Total − paid, never below 0. */
  remainingCents: number;
  /** Unpaid instances from `asOf` on plus the payments still to be generated. */
  paymentsLeft: number;
  /** The next payment to make (an overdue one included), `YYYY-MM-DD`. */
  nextDate: string | null;
  /** Last payment, `YYYY-MM-DD`, and its amount (partial or not). */
  lastDate: string | null;
  lastAmountCents: number | null;
};

export type InstanceForProgress = { dueDate: string; amountCents: number; paid: boolean };

/**
 * Progress from the template and its instances. Generated instances count with their own amounts; beyond
 * `generatedUntil` the plan supplies the rest. An ended template has nothing more planned.
 */
export function totalOpenProgress(input: {
  amountCents: number;
  totalOpenCents: number;
  asOf: string;
  rrule: string;
  startDate: string;
  generatedUntil: string | null;
  status: "active" | "paused" | "ended";
  instances: readonly InstanceForProgress[];
}): TotalOpenProgress {
  const counted = input.instances.filter((item) => item.dueDate >= input.asOf).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = counted.filter((item) => item.paid);
  const unpaid = counted.filter((item) => !item.paid);
  const paidCents = paid.reduce((sum, item) => sum + item.amountCents, 0);
  const future =
    input.status === "ended"
      ? []
      : planTotalOpen({
          amountCents: input.amountCents,
          totalOpenCents: input.totalOpenCents,
          asOf: input.asOf,
          rrule: input.rrule,
          startDate: input.startDate,
          from: input.generatedUntil ? nextDay(input.generatedUntil) : input.asOf,
          settled: counted,
        }).payments;
  const upcoming = [...unpaid, ...future];
  const last = upcoming.at(-1) ?? null;
  return {
    totalCents: input.totalOpenCents,
    asOf: input.asOf,
    paidCents,
    paidCount: paid.length,
    remainingCents: Math.max(0, input.totalOpenCents - paidCents),
    paymentsLeft: upcoming.length,
    nextDate: upcoming[0]?.dueDate ?? null,
    lastDate: last?.dueDate ?? null,
    lastAmountCents: last?.amountCents ?? null,
  };
}

const nextDay = (date: string) => addDays(date, 1);

/** What the form explains: "12 payments: 11 × € 853,17 + last € 615,13", last on … */
export type TotalOpenPreview = {
  /** Payments still to make. */
  count: number;
  /** Of which at the regular amount (all of them when the total divides evenly). */
  regularCount: number;
  regularCents: number;
  lastCents: number;
  lastDate: string | null;
  /** The last payment is less than the regular amount. */
  partial: boolean;
  /** Already paid since the as-of date (taken off the total). */
  paidCents: number;
  remainingCents: number;
  tooMany: boolean;
};

/**
 * The form's preview of a total open amount: payments from `from` on for the total minus what is already
 * paid. `null` without a usable amount, total or rule.
 */
export function previewTotalOpen(input: {
  amountCents: number | null;
  totalOpenCents: number | null;
  rrule: string;
  startDate: string;
  from: string;
  paidCents?: number;
}): TotalOpenPreview | null {
  const { amountCents, totalOpenCents, rrule, startDate, from, paidCents = 0 } = input;
  if (!amountCents || amountCents <= 0 || !totalOpenCents || totalOpenCents <= 0 || !baseRuleOf(rrule)) return null;
  const remainingCents = Math.max(0, totalOpenCents - paidCents);
  const plan = planTotalOpen({ amountCents, totalOpenCents: remainingCents, asOf: from, rrule, startDate });
  const last = plan.payments.at(-1);
  const partial = last !== undefined && last.amountCents < amountCents;
  return {
    count: plan.payments.length,
    regularCount: partial ? plan.payments.length - 1 : plan.payments.length,
    regularCents: amountCents,
    lastCents: last?.amountCents ?? 0,
    lastDate: last?.dueDate ?? null,
    partial,
    paidCents,
    remainingCents,
    tooMany: plan.tooMany,
  };
}

/**
 * The form's preview of a total open amount. Editing a loan with the same as-of date takes off what is
 * already paid since then and starts at its next payment; otherwise payments start at the as-of date (empty:
 * the next due date, or the first due date of a new one). The server recomputes the same on save.
 */
export function totalOpenPreviewFor(input: {
  amountCents: number | null;
  totalCents: number | null;
  asOf: string;
  rrule: string;
  startDate: string;
  nextDueDate?: string | null;
  progress?: TotalOpenProgress | null;
}): TotalOpenPreview | null {
  const same = input.progress && input.asOf === input.progress.asOf ? input.progress : null;
  const from = same ? (same.nextDate ?? same.asOf) : input.asOf || input.nextDueDate || input.startDate;
  return previewTotalOpen({
    amountCents: input.amountCents,
    totalOpenCents: input.totalCents,
    rrule: input.rrule,
    startDate: input.startDate,
    from,
    paidCents: same?.paidCents ?? 0,
  });
}

/** Share of the total that is paid, 0–100 (for a progress bar). */
export const totalOpenPaidPercent = (progress: Pick<TotalOpenProgress, "totalCents" | "remainingCents">) =>
  progress.totalCents > 0 ? Math.min(100, Math.max(0, Math.round(((progress.totalCents - progress.remainingCents) / progress.totalCents) * 100))) : 0;
