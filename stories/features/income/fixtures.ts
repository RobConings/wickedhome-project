import type { Habitant } from "@/features/household";
import {
  buildOccurrences,
  monthRange,
  monthTotals,
  nextOccurrenceOf,
  occurrencesPerYear,
  amountEntryOn,
  upcomingIncomes,
  voucherBalances,
} from "@/features/income/types/income-calculations";
import type { Income, IncomeOverview, IncomeSource, IncomeTargetAccount } from "@/features/income/types/income";
import { habitantFixtures } from "../household/fixtures";

/** Pinned to the same day as the other features' fixtures. */
export const incomeToday = "2026-10-02";
export const incomeMonth = "2026-10";

export const incomeHabitants: Habitant[] = Object.values(habitantFixtures);

export const incomeAccounts: IncomeTargetAccount[] = [
  { id: "acc-joint", name: "Gezamenlijke rekening", kind: "joint" },
  { id: "acc-savings", name: "Spaarrekening", kind: "savings" },
];

type SourceSeed = Omit<IncomeSource, "currentAmountCents" | "currentAmountFrom" | "nextDate" | "active" | "monthlyCents">;

/** Fills in the derived fields the API computes. */
function source(seed: SourceSeed): IncomeSource {
  const current = seed.amountMode === "fixed" ? amountEntryOn(seed.amounts, incomeToday) : null;
  const currentAmountCents = seed.amountMode === "fixed" ? (current?.amountCents ?? null) : seed.estimateCents;
  return {
    ...seed,
    currentAmountCents,
    currentAmountFrom: current?.effectiveFrom ?? null,
    nextDate: nextOccurrenceOf(seed, incomeToday),
    active: !seed.endDate || seed.endDate >= incomeToday,
    monthlyCents: currentAmountCents === null ? null : Math.round((currentAmountCents * occurrencesPerYear(seed.rrule)) / 12),
  };
}

const base = { targetAccountId: null, notes: null, endDate: null, estimateCents: null, amounts: [] };

export const sourceFixtures = {
  robSalary: source({
    ...base,
    id: "src-rob-salary",
    habitantId: "h1",
    name: "Loon Acme",
    kind: "salary",
    rrule: "FREQ=MONTHLY",
    startDate: "2025-01-25",
    amountMode: "fixed",
    amounts: [
      { id: "amt-1", effectiveFrom: "2025-01-25", amountCents: 238_000 },
      { id: "amt-2", effectiveFrom: "2026-01-01", amountCents: 245_000 },
    ],
  }),
  sofieSalary: source({
    ...base,
    id: "src-sofie-salary",
    habitantId: "h2",
    name: "Loon Ziekenhuis",
    kind: "salary",
    rrule: "FREQ=MONTHLY",
    startDate: "2025-03-01",
    amountMode: "fixed",
    amounts: [{ id: "amt-3", effectiveFrom: "2025-03-01", amountCents: 231_000 }],
  }),
  robVouchers: source({
    ...base,
    id: "src-rob-vouchers",
    habitantId: "h1",
    name: "Maaltijdcheques",
    kind: "meal_vouchers",
    rrule: "FREQ=MONTHLY",
    startDate: "2025-01-05",
    amountMode: "variable",
    estimateCents: 16_000,
  }),
  sofieVouchers: source({
    ...base,
    id: "src-sofie-vouchers",
    habitantId: "h2",
    name: "Maaltijdcheques",
    kind: "meal_vouchers",
    rrule: "FREQ=MONTHLY",
    startDate: "2025-03-05",
    amountMode: "variable",
    estimateCents: null,
  }),
  childBenefit: source({
    ...base,
    id: "src-groeipakket",
    habitantId: null,
    name: "Groeipakket Lena",
    kind: "benefit",
    rrule: "FREQ=MONTHLY",
    startDate: "2016-04-10",
    amountMode: "fixed",
    targetAccountId: "acc-joint",
    amounts: [{ id: "amt-4", effectiveFrom: "2016-04-10", amountCents: 17_500 }],
  }),
  holidayPay: source({
    ...base,
    id: "src-rob-holiday",
    habitantId: "h1",
    name: "Vakantiegeld",
    kind: "holiday_pay",
    rrule: "FREQ=YEARLY",
    startDate: "2026-05-28",
    amountMode: "fixed",
    amounts: [{ id: "amt-5", effectiveFrom: "2026-05-28", amountCents: 220_000 }],
  }),
} satisfies Record<string, IncomeSource>;

export const incomeSources: IncomeSource[] = Object.values(sourceFixtures);

const income = (fields: Partial<Income> & Pick<Income, "id" | "date" | "amountCents" | "kind">): Income => ({
  habitantId: null,
  description: null,
  sourceId: null,
  periodDate: null,
  targetAccountId: null,
  note: null,
  ...fields,
});

export const incomeFixtures = {
  robVouchersOctober: income({ id: "inc-1", habitantId: "h1", date: "2026-10-02", amountCents: 17_600, kind: "meal_vouchers", sourceId: "src-rob-vouchers", periodDate: "2026-10-05" }),
  childBenefitOctober: income({ id: "inc-2", date: "2026-10-01", amountCents: 17_500, kind: "benefit", sourceId: "src-groeipakket", periodDate: "2026-10-10", targetAccountId: "acc-joint" }),
  taxReturn: income({ id: "inc-3", habitantId: "h2", date: "2026-09-18", amountCents: 84_312, kind: "tax_return", description: "Belastingteruggave 2025" }),
  greenCertificates: income({ id: "inc-4", date: "2026-09-30", amountCents: 31_250, kind: "green_certificates", description: "Groenestroomcertificaten Q3", targetAccountId: "acc-joint" }),
  robSalarySeptember: income({ id: "inc-5", habitantId: "h1", date: "2026-09-25", amountCents: 245_000, kind: "salary", sourceId: "src-rob-salary", periodDate: "2026-09-25" }),
  sofieSalarySeptember: income({ id: "inc-6", habitantId: "h2", date: "2026-09-01", amountCents: 231_000, kind: "salary", sourceId: "src-sofie-salary", periodDate: "2026-09-01" }),
  robVouchersSeptember: income({ id: "inc-7", habitantId: "h1", date: "2026-09-04", amountCents: 15_200, kind: "meal_vouchers", sourceId: "src-rob-vouchers", periodDate: "2026-09-05" }),
  sofieSalaryOctober: income({ id: "inc-8", habitantId: "h2", date: "2026-10-01", amountCents: 231_000, kind: "salary", sourceId: "src-sofie-salary", periodDate: "2026-10-01" }),
  /** Announced for later this month: expected, not received yet ("Expected 30/10/2026"). */
  robTaxReturnUpcoming: income({ id: "inc-9", habitantId: "h1", date: "2026-10-30", amountCents: 180_000, kind: "tax_return", description: "Belastingteruggave 2025" }),
} satisfies Record<string, Income>;

export const incomeList: Income[] = Object.values(incomeFixtures).sort((a, b) => b.date.localeCompare(a.date));

/** What the meal voucher spending (expenses paid with meal vouchers) adds up to per person. */
export const voucherSpendingFixture = [
  { habitantId: "h1", amountCents: 8_430, date: "2026-09-12" },
  { habitantId: "h1", amountCents: 6_215, date: "2026-09-26" },
  { habitantId: "h2", amountCents: 4_500, date: "2026-09-20" },
];

/** Older voucher lots: Rob's from 20 Oct 2025 expire within 30 days of `incomeToday`; Sofie's from 2025 expired. */
export const olderVoucherIncomesFixture: Income[] = [
  income({ id: "inc-old-1", habitantId: "h1", date: "2025-10-20", amountCents: 25_000, kind: "meal_vouchers", sourceId: "src-rob-vouchers", periodDate: "2025-10-20" }),
  income({ id: "inc-old-2", habitantId: "h2", date: "2025-08-14", amountCents: 6_000, kind: "meal_vouchers" }),
];

/** Balances on `incomeToday` with the older lots: part of Rob's vouchers expire soon, Sofie's expired. */
export const expiringVoucherBalancesFixture = voucherBalances([...incomeList, ...olderVoucherIncomesFixture], voucherSpendingFixture, incomeToday);

/** An overview as `GET /api/income?month=…` computes it. */
export function incomeOverviewFor(month: string, sources = incomeSources, incomes = incomeList): IncomeOverview {
  const { from, to } = monthRange(month);
  const occurrences = buildOccurrences(sources, incomes, from, to, incomeToday);
  return {
    today: incomeToday,
    month,
    sources,
    occurrences,
    upcoming: upcomingIncomes(month, occurrences, incomes, incomeToday),
    incomes,
    totals: monthTotals(month, occurrences, incomes, incomeToday),
    vouchers: voucherBalances(incomes, voucherSpendingFixture, incomeToday),
    accounts: incomeAccounts,
  };
}

export const incomeOverviewFixture = incomeOverviewFor(incomeMonth);
export const septemberIncomeOverviewFixture = incomeOverviewFor("2026-09");

export const emptyIncomeOverviewFixture: IncomeOverview = {
  today: incomeToday,
  month: incomeMonth,
  sources: [],
  occurrences: [],
  upcoming: [],
  incomes: [],
  totals: { people: [], household: { receivedCents: 0, expectedCents: 0, totalCents: 0 }, vouchersCents: {} },
  vouchers: [],
  accounts: [],
};
