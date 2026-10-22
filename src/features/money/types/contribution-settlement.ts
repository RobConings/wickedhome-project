import { monthBounds } from "./money-calculations";
import type { ContributionEntry, ContributionRow, JointCosts } from "./money";
import { sumCents } from "@/types/collections";

/*
 * Settling the month's contributions (docs/FINANCE.md, "Contributions: settling the month"). Pure and
 * computed on every read: who planned what, who actually transferred what, what still has to happen, and
 * whether the planned contributions cover the joint costs. Shared by the API, the screens and the tests.
 */

export type ContributionStatus = "done" | "over" | "short";

/** One person's contributions to one account in a month. */
export type PersonSettlement = {
  habitantId: string;
  accountId: string;
  planId: string | null;
  plannedCents: number;
  plannedDate: string | null;
  /** Net: contributions minus what was taken back. */
  transferredCents: number;
  /** Transferred − planned. */
  differenceCents: number;
  /** Part of the surplus kept as extra on purpose (no longer flagged). */
  keptExtraCents: number;
  /** Surplus still flagged ("€ 800,00 too much"). */
  overCents: number;
  /** Still to transfer ("still € 1.450,00 to transfer"). */
  shortCents: number;
  status: ContributionStatus;
  entries: ContributionEntry[];
};

export type SettlementStep =
  /** Transfer what is still missing to the account. */
  | { kind: "transfer"; habitantId: string; accountId: string; amountCents: number; date: string | null }
  /** Take an over-contribution back (or keep it as extra). */
  | { kind: "take-back"; habitantId: string; accountId: string; amountCents: number };

/** One person pays another directly instead of both going through the joint account. */
export type DirectPayment = { fromHabitantId: string; toHabitantId: string; amountCents: number };

export type AccountSettlement = {
  accountId: string;
  people: PersonSettlement[];
  /** What still needs to happen, transfers first. Empty: settled. */
  steps: SettlementStep[];
  /** Someone is over and someone else short: they can settle directly (same end result), then these steps. */
  netting: { direct: DirectPayment[]; steps: SettlementStep[] } | null;
  /** What each person has put in once the steps are done: their plan plus the extra they keep. */
  endResult: { habitantId: string; amountCents: number }[];
  /** On the account once the steps are done. */
  totalCents: number;
  settled: boolean;
};

/** Planned vs transferred of one person: the difference, the part kept as extra and the status. */
export function personSettlement(row: ContributionRow): PersonSettlement {
  const differenceCents = row.recordedCents - row.plannedCents;
  const keptExtraCents = differenceCents > 0 ? Math.min(Math.max(0, row.keptExtraCents), differenceCents) : 0;
  const overCents = Math.max(0, differenceCents - keptExtraCents);
  const shortCents = Math.max(0, -differenceCents);
  return {
    habitantId: row.habitantId,
    accountId: row.accountId,
    planId: row.planId,
    plannedCents: row.plannedCents,
    plannedDate: row.plannedDate,
    transferredCents: row.recordedCents,
    differenceCents,
    keptExtraCents,
    overCents,
    shortCents,
    status: overCents > 0 ? "over" : shortCents > 0 ? "short" : "done",
    entries: row.entries,
  };
}

function stepsFor(people: readonly { habitantId: string; accountId: string; overCents: number; shortCents: number; plannedDate: string | null }[]): SettlementStep[] {
  const transfers: SettlementStep[] = people
    .filter((person) => person.shortCents > 0)
    .map((person) => ({ kind: "transfer", habitantId: person.habitantId, accountId: person.accountId, amountCents: person.shortCents, date: person.plannedDate }));
  const takeBacks: SettlementStep[] = people
    .filter((person) => person.overCents > 0)
    .map((person) => ({ kind: "take-back", habitantId: person.habitantId, accountId: person.accountId, amountCents: person.overCents }));
  return [...transfers, ...takeBacks];
}

/**
 * Netting: whoever is short pays whoever is over directly (largest amounts first), then only the rest goes
 * through the account. `null` when nobody is over or nobody is short.
 */
export function netContributions(people: readonly PersonSettlement[]): AccountSettlement["netting"] {
  const over = people.filter((person) => person.overCents > 0).map((person) => ({ ...person })).sort((a, b) => b.overCents - a.overCents);
  const short = people.filter((person) => person.shortCents > 0).map((person) => ({ ...person })).sort((a, b) => b.shortCents - a.shortCents);
  if (over.length === 0 || short.length === 0) return null;
  const direct: DirectPayment[] = [];
  for (const payer of short) {
    for (const receiver of over) {
      const amountCents = Math.min(payer.shortCents, receiver.overCents);
      if (amountCents <= 0) continue;
      direct.push({ fromHabitantId: payer.habitantId, toHabitantId: receiver.habitantId, amountCents });
      payer.shortCents -= amountCents;
      receiver.overCents -= amountCents;
    }
  }
  const order = (id: string) => people.findIndex((person) => person.habitantId === id);
  const rest = [...short, ...over].sort((a, b) => order(a.habitantId) - order(b.habitantId));
  return { direct, steps: stepsFor(rest) };
}

/** The settlement of one account: per person, what still has to happen, the netting alternative and the end result. */
export function settleAccount(accountId: string, rows: readonly ContributionRow[]): AccountSettlement {
  const people = rows.filter((row) => row.accountId === accountId).map(personSettlement);
  const steps = stepsFor(people);
  const endResult = people
    .map((person) => ({ habitantId: person.habitantId, amountCents: person.plannedCents + person.keptExtraCents }))
    .filter((item) => item.amountCents !== 0);
  return {
    accountId,
    people,
    steps,
    netting: netContributions(people),
    endResult,
    totalCents: sumCents(endResult),
    settled: steps.length === 0,
  };
}

/** The settlement per account, in the order the accounts first appear in the rows. */
export function settleContributions(rows: readonly ContributionRow[]): AccountSettlement[] {
  const accountIds = [...new Set(rows.map((row) => row.accountId))];
  return accountIds.map((accountId) => settleAccount(accountId, rows));
}

// ── Coverage ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The joint costs of a month from the expenses feature's flow items (payer JOINT): paid in the month, and
 * unpaid ones due in the month, computed occurrences of recurring expenses and loans included. Unpaid
 * expenses from earlier months are left out (they belong to their own month).
 */
export function jointCostsOfMonth(items: readonly { date: string; amountCents: number; paid: boolean }[], month: string): JointCosts {
  const { from, to } = monthBounds(month);
  const inMonth = items.filter((item) => item.date >= from && item.date <= to);
  const toPay = inMonth
    .filter((item) => !item.paid)
    .map((item) => ({ date: item.date, amountCents: item.amountCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    paidCents: inMonth.filter((item) => item.paid).reduce((sum, item) => sum + item.amountCents, 0),
    toPayCents: sumCents(toPay),
    toPay,
  };
}

export type PlanSuggestion = { planId: string; habitantId: string; accountId: string; currentCents: number; suggestedCents: number };

export type CoverageStatus = "covered" | "short" | "left-over";

export type Coverage = {
  /** Planned contributions to the joint current accounts this month. */
  plannedCents: number;
  /** Joint costs this month: paid + still to pay. */
  costsCents: number;
  paidCents: number;
  toPayCents: number;
  /** Planned − costs: negative is short, positive left over. */
  differenceCents: number;
  status: CoverageStatus;
  /** The current month only: where the joint balance ends up at the end of the month. */
  projection: {
    balanceCents: number;
    /** Still to come in: contributions people are short, plus incomes dated later this month (`incoming`). */
    toReceiveCents: number;
    toPayCents: number;
    /** Balance + still to receive − still to pay. */
    endCents: number;
    /** The lowest balance on the way (payments before receipts on the same day). */
    lowestCents: number;
    /** First day the balance would be below zero; `null` when it stays at or above zero. */
    belowZeroOn: string | null;
  } | null;
  /** Short: new plan amounts that cover the costs. */
  suggestions: { byPlan: PlanSuggestion[]; byIncome: PlanSuggestion[] | null } | null;
};

/** `total` split over `weights` proportionally, every part rounded up to whole euros (so the parts cover it). */
export function splitProportionally(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0);
  if (sum <= 0) return weights.map(() => 0);
  return weights.map((weight) => Math.ceil((totalCents * Math.max(0, weight)) / sum / 100) * 100);
}

/**
 * Do the planned contributions cover the joint costs of the month? Also the projected end-of-month balance
 * of the joint account (current month) and, when short, new plan amounts split like the current plans or,
 * when incomes are known, like the people's incomes.
 */
export function contributionCoverage(input: {
  /** `YYYY-MM` */
  month: string;
  today: string;
  /** People with their contributions to the joint current accounts (not savings). */
  people: readonly PersonSettlement[];
  costs: JointCosts;
  /** Today's balance of the joint current accounts; `null` without one. */
  balanceCents: number | null;
  /** The month's income per person (received + expected), for the income-based suggestion. */
  incomes?: readonly { habitantId: string; cents: number }[];
  /**
   * Incomes landing on the joint current accounts dated after today (not in today's balance yet): they raise
   * the projected end-of-month balance on their date. Others are ignored.
   */
  incoming?: readonly { date: string; amountCents: number }[];
}): Coverage {
  const { month, today, people, costs, balanceCents } = input;
  const plannedCents = people.reduce((sum, person) => sum + person.plannedCents, 0);
  const costsCents = costs.paidCents + costs.toPayCents;
  const differenceCents = plannedCents - costsCents;
  const status: CoverageStatus = differenceCents < 0 ? "short" : differenceCents > 0 ? "left-over" : "covered";

  let projection: Coverage["projection"] = null;
  const { from, to } = monthBounds(month);
  if (balanceCents !== null && today >= from && today <= to) {
    const atLeastToday = (date: string | null) => (date && date > today ? date : today);
    const incoming = (input.incoming ?? []).filter((item) => item.date > today && item.date <= to && item.amountCents > 0);
    const events = [
      ...costs.toPay.map((item) => ({ date: atLeastToday(item.date), cents: -item.amountCents })),
      ...people.filter((person) => person.shortCents > 0).map((person) => ({ date: atLeastToday(person.plannedDate), cents: person.shortCents })),
      ...incoming.map((item) => ({ date: item.date, cents: item.amountCents })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.cents - b.cents);
    let running = balanceCents;
    let lowestCents = balanceCents;
    let belowZeroOn: string | null = balanceCents < 0 ? today : null;
    for (const event of events) {
      running += event.cents;
      if (running < lowestCents) lowestCents = running;
      if (running < 0 && !belowZeroOn) belowZeroOn = event.date;
    }
    const toReceiveCents =
      people.reduce((sum, person) => sum + person.shortCents, 0) + sumCents(incoming);
    projection = { balanceCents, toReceiveCents, toPayCents: costs.toPayCents, endCents: balanceCents + toReceiveCents - costs.toPayCents, lowestCents, belowZeroOn };
  }

  let suggestions: Coverage["suggestions"] = null;
  const planned = people.filter((person) => person.planId && person.plannedCents > 0);
  if (status === "short" && planned.length > 0) {
    const toSuggestion = (amounts: number[]) =>
      planned.map((person, index) => ({
        planId: person.planId as string,
        habitantId: person.habitantId,
        accountId: person.accountId,
        currentCents: person.plannedCents,
        suggestedCents: amounts[index] ?? 0,
      }));
    const byPlan = toSuggestion(splitProportionally(costsCents, planned.map((person) => person.plannedCents)));
    const incomeOf = (habitantId: string) => input.incomes?.find((item) => item.habitantId === habitantId)?.cents ?? 0;
    const onePlanEach = new Set(planned.map((person) => person.habitantId)).size === planned.length;
    const incomeWeights = planned.map((person) => incomeOf(person.habitantId));
    const byIncome =
      onePlanEach && incomeWeights.every((weight) => weight > 0) && planned.length > 1
        ? toSuggestion(splitProportionally(costsCents, incomeWeights))
        : null;
    suggestions = { byPlan, byIncome };
  }

  return { plannedCents, costsCents, paidCents: costs.paidCents, toPayCents: costs.toPayCents, differenceCents, status, projection, suggestions };
}
