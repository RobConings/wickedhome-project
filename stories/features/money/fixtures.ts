import type { Habitant } from "@/features/household";
import {
  balanceAt,
  contributionRows,
  lastCorrectionAt,
  runLedger,
  summarizeMonth,
  type ContributionInput,
  type LedgerItem,
} from "@/features/money/types/money-calculations";
import type { ContributionPlan, JointAccount, JointCosts, MoneyLoans, MoneyMonth, MoneySummary, MoneyTimeline } from "@/features/money/types/money";
import {
  buildMoneyTimeline,
  loanTotals,
  monthsBetween,
  type TimelineExpense,
  type TimelineIncome,
} from "@/features/money/types/money-timeline";
import { addMonthsClamped, monthOf } from "@/types/dates";
import { recurringFixtures } from "../expenses/fixtures";
import { habitantFixtures } from "../household/fixtures";

/** Pinned to the same day as the other features' fixtures. */
export const moneyToday = "2026-10-02";
export const moneyMonthKey = "2026-10";

export const moneyHabitants: Habitant[] = Object.values(habitantFixtures);

const entry = (fields: Partial<LedgerItem> & Pick<LedgerItem, "key" | "accountId" | "date" | "type" | "amountCents">): LedgerItem => ({
  source: "entry",
  sourceId: fields.key.split(":")[1] ?? fields.key,
  setBalanceCents: null,
  habitantId: null,
  counterpartAccountId: null,
  label: null,
  note: null,
  createdAt: `${fields.date}T08:00:00.000Z`,
  ...fields,
});

const jointItems: LedgerItem[] = [
  entry({ key: "entry:open-joint", accountId: "acc-joint", date: "2026-09-01", type: "correction", amountCents: 312_045, setBalanceCents: 312_045, note: null }),
  entry({ key: "entry:c-rob-sep", accountId: "acc-joint", date: "2026-09-02", type: "contribution", amountCents: 150_000, habitantId: "h1" }),
  entry({ key: "entry:c-sofie-sep", accountId: "acc-joint", date: "2026-09-03", type: "contribution", amountCents: 150_000, habitantId: "h2" }),
  { ...entry({ key: "expense:e-fluvius", accountId: "acc-joint", date: "2026-09-12", type: "expense", amountCents: -14_500, label: "Fluvius" }), source: "expense", sourceId: "e-fluvius", createdAt: "" },
  { ...entry({ key: "expense:e-proximus", accountId: "acc-joint", date: "2026-09-20", type: "expense", amountCents: -8_999, label: "Proximus" }), source: "expense", sourceId: "e-proximus", createdAt: "" },
  entry({ key: "entry:t-sep-out", accountId: "acc-joint", date: "2026-09-26", type: "transfer", amountCents: -50_000, counterpartAccountId: "acc-savings" }),
  entry({ key: "entry:fix-sep", accountId: "acc-joint", date: "2026-09-30", type: "correction", amountCents: 0, setBalanceCents: 535_000, note: "Bank app" }),
  { ...entry({ key: "income:inc-2", accountId: "acc-joint", date: "2026-10-01", type: "income", amountCents: 17_500, label: "Groeipakket Lena" }), source: "income", sourceId: "inc-2", createdAt: "" },
  entry({ key: "entry:c-rob-oct", accountId: "acc-joint", date: "2026-10-01", type: "contribution", amountCents: 150_000, habitantId: "h1" }),
  { ...entry({ key: "expense:e-hendrickx", accountId: "acc-joint", date: "2026-10-02", type: "expense", amountCents: -23_850, label: "Loodgieter Hendrickx" }), source: "expense", sourceId: "e-hendrickx", createdAt: "" },
];

const savingsItems: LedgerItem[] = [
  entry({ key: "entry:open-savings", accountId: "acc-savings", date: "2026-09-01", type: "correction", amountCents: 800_000, setBalanceCents: 800_000 }),
  entry({ key: "entry:t-sep-in", accountId: "acc-savings", date: "2026-09-26", type: "transfer", amountCents: 50_000, counterpartAccountId: "acc-joint" }),
  entry({ key: "entry:interest", accountId: "acc-savings", date: "2026-10-01", type: "income", amountCents: 1_212, note: "Interest Q3" }),
];

export const jointLedger = runLedger(jointItems, moneyToday);
export const savingsLedger = runLedger(savingsItems, moneyToday);

const account = (fields: Omit<JointAccount, "balanceCents" | "lastCorrection">, lines: typeof jointLedger): JointAccount => ({
  ...fields,
  balanceCents: balanceAt(lines, moneyToday),
  lastCorrection: lastCorrectionAt(lines, moneyToday),
});

export const accountFixtures = {
  joint: account(
    { id: "acc-joint", name: "Gezamenlijke rekening", kind: "joint", iban: "BE68539007547034", color: "#124734", ownerIds: ["h1", "h2"], isDefault: true, archived: false },
    jointLedger,
  ),
  savings: account(
    { id: "acc-savings", name: "Spaarrekening", kind: "savings", iban: null, color: "#0d9488", ownerIds: ["h1", "h2"], isDefault: false, archived: false },
    savingsLedger,
  ),
} satisfies Record<string, JointAccount>;

export const moneyAccounts: JointAccount[] = Object.values(accountFixtures);

export const planFixtures: ContributionPlan[] = [
  { id: "plan-rob", habitantId: "h1", accountId: "acc-joint", amountCents: 150_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
  { id: "plan-sofie", habitantId: "h2", accountId: "acc-joint", amountCents: 150_000, dayOfMonth: 3, activeFrom: "2026-01-01", activeTo: null, note: null },
  { id: "plan-rob-savings", habitantId: "h1", accountId: "acc-savings", amountCents: 20_000, dayOfMonth: 26, activeFrom: "2026-06-01", activeTo: null, note: null },
];

const ledgers = [jointLedger, savingsLedger];

export function moneyMonthFor(month: string): MoneyMonth {
  const contributions = ledgers
    .flat()
    .filter((line) => line.type === "contribution")
    .map((line) => ({ habitantId: line.habitantId, accountId: line.accountId, date: line.date, amountCents: line.amountCents }));
  return {
    today: moneyToday,
    month,
    accounts: moneyAccounts,
    accountMonths: [summarizeMonth("acc-joint", jointLedger, month, moneyToday), summarizeMonth("acc-savings", savingsLedger, month, moneyToday)],
    income: {
      people: [
        { key: "h1", receivedCents: 0, expectedCents: 245_000, totalCents: 245_000, toEnterCount: 0 },
        { key: "h2", receivedCents: 231_000, expectedCents: 0, totalCents: 231_000, toEnterCount: 1 },
        { key: "joint", receivedCents: 17_500, expectedCents: 0, totalCents: 17_500, toEnterCount: 0 },
      ],
      household: { receivedCents: 248_500, expectedCents: 245_000, totalCents: 493_500, toEnterCount: 1 },
      vouchersCents: { h1: 17_600 },
    },
    plans: planFixtures,
    contributions: contributionRows(planFixtures, contributions, month),
    jointOutgoings: {
      items: [
        { id: "e-hendrickx", payee: "Loodgieter Hendrickx", amountCents: 23_850, dueDate: "2026-10-02", paidOn: "2026-10-02", category: "housing" },
        { id: "e-fluvius-oct", payee: "Fluvius", amountCents: 14_500, dueDate: "2026-10-12", paidOn: null, category: "energy" },
        { id: "e-proximus-oct", payee: "Proximus", amountCents: 8_999, dueDate: "2026-10-20", paidOn: null, category: "internet_phone" },
        { id: "e-insurance", payee: "Ethias woonverzekering", amountCents: 41_237, dueDate: "2026-09-28", paidOn: null, category: "insurance" },
      ],
      paidCents: 23_850,
      upcomingCents: 23_499,
    },
    jointCosts: {
      paidCents: 23_850,
      toPayCents: 23_499,
      toPay: [
        { date: "2026-10-12", amountCents: 14_500 },
        { date: "2026-10-20", amountCents: 8_999 },
      ],
    },
    vouchers: [
      {
        habitantId: "h1",
        receivedCents: 32_800,
        spentCents: 14_645,
        availableCents: 18_155,
        expiredCents: 0,
        uncoveredCents: 0,
        balanceCents: 18_155,
        nextExpiry: { date: "2027-09-04", amountCents: 555 },
        expiringSoon: null,
      },
      {
        habitantId: "h2",
        receivedCents: 0,
        spentCents: 4_500,
        availableCents: 0,
        expiredCents: 0,
        uncoveredCents: 4_500,
        balanceCents: -4_500,
        nextExpiry: null,
        expiringSoon: null,
      },
    ],
  };
}

export const moneyMonthFixture = moneyMonthFor(moneyMonthKey);
/** September: the month with a correction ("set to € 5.350"). */
export const septemberMoneyFixture = moneyMonthFor("2026-09");

export const emptyMoneyMonthFixture: MoneyMonth = {
  today: moneyToday,
  month: moneyMonthKey,
  accounts: [],
  accountMonths: [],
  income: { people: [], household: { receivedCents: 0, expectedCents: 0, totalCents: 0, toEnterCount: 0 }, vouchersCents: {} },
  plans: [],
  contributions: [],
  jointOutgoings: { items: [], paidCents: 0, upcomingCents: 0 },
  jointCosts: { paidCents: 0, toPayCents: 0, toPay: [] },
  vouchers: [],
};

// ── Settling the month's contributions (docs/FINANCE.md, "Contributions: settling the month") ───────────

const settlementPlans: ContributionPlan[] = [
  { id: "plan-rob", habitantId: "h1", accountId: "acc-joint", amountCents: 145_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
  { id: "plan-sofie", habitantId: "h2", accountId: "acc-joint", amountCents: 120_000, dayOfMonth: 1, activeFrom: "2026-01-01", activeTo: null, note: null },
];

/** The owner's October: € 1.340,70 paid and € 2.633,18 still to pay from the joint account. */
const ownerCosts: JointCosts = {
  paidCents: 134_070,
  toPayCents: 263_318,
  toPay: [
    { date: "2026-10-05", amountCents: 120_000 },
    { date: "2026-10-15", amountCents: 98_318 },
    { date: "2026-10-25", amountCents: 45_000 },
  ],
};

/** Joint costs the planned € 2.650,00 covers exactly. */
const coveredCosts: JointCosts = { paidCents: 100_000, toPayCents: 165_000, toPay: [{ date: "2026-10-10", amountCents: 165_000 }] };

function settlementMonth({
  entries,
  extras = [],
  costs = ownerCosts,
  jointBalanceCents,
}: {
  entries: ContributionInput[];
  extras?: { habitantId: string; accountId: string; month: string; amountCents: number }[];
  costs?: JointCosts;
  jointBalanceCents?: number;
}): MoneyMonth {
  const base = moneyMonthFor(moneyMonthKey);
  return {
    ...base,
    accounts:
      jointBalanceCents === undefined
        ? base.accounts
        : base.accounts.map((item) => (item.id === "acc-joint" ? { ...item, balanceCents: jointBalanceCents } : item)),
    plans: settlementPlans,
    contributions: contributionRows(settlementPlans, entries, moneyMonthKey, extras),
    jointCosts: costs,
  };
}

const contribution = (id: string, habitantId: string, date: string, amountCents: number, fields: Partial<ContributionInput> = {}): ContributionInput => ({
  id,
  habitantId,
  accountId: "acc-joint",
  date,
  amountCents,
  ...fields,
});

/** Month fixtures for each settlement state. Rob (h1) plans € 1.450,00, Sofie (h2) € 1.200,00. */
export const settlementFixtures = {
  /** Sofie transferred € 2.000,00 on 1 Oct (before the balance was set), Rob nothing yet: one over, one short, netting. */
  oneOverOneShort: settlementMonth({ entries: [contribution("c-sofie", "h2", "2026-10-01", 200_000, { absorbed: true })], jointBalanceCents: 152_000 }),
  /** Both transferred their plan; the costs are covered. */
  everyoneDone: settlementMonth({
    entries: [contribution("c-rob", "h1", "2026-10-01", 145_000), contribution("c-sofie", "h2", "2026-10-01", 120_000)],
    costs: coveredCosts,
  }),
  /** Rob transferred part, Sofie nothing. */
  bothShort: settlementMonth({ entries: [contribution("c-rob", "h1", "2026-10-01", 50_000)] }),
  /** Sofie took € 800,00 back: she is done, Rob still has to transfer. */
  afterTakeBack: settlementMonth({
    entries: [
      contribution("c-sofie", "h2", "2026-10-01", 200_000, { absorbed: true }),
      contribution("c-sofie-back", "h2", "2026-10-03", -80_000, { note: null }),
    ],
  }),
  /** Sofie keeps € 800,00 as extra; Rob transferred his plan. */
  keptExtra: settlementMonth({
    entries: [contribution("c-rob", "h1", "2026-10-01", 145_000), contribution("c-sofie", "h2", "2026-10-01", 200_000)],
    extras: [{ habitantId: "h2", accountId: "acc-joint", month: moneyMonthKey, amountCents: 80_000 }],
  }),
  /** The plans cover the costs exactly, nothing transferred yet. */
  covered: settlementMonth({ entries: [], costs: coveredCosts }),
  /** Short, and the joint account would go below zero on 5 Oct before the contributions arrive. */
  belowZero: settlementMonth({ entries: [], jointBalanceCents: 20_000 }),
} satisfies Record<string, MoneyMonth>;

export const moneySummaryFixture: MoneySummary = {
  today: moneyToday,
  month: moneyMonthKey,
  incomeCents: 493_500,
  incomeReceivedCents: 248_500,
  outCents: 88_586,
  outPaidCents: 23_850,
  jointBalanceCents: accountFixtures.joint.balanceCents,
  savingsBalanceCents: accountFixtures.savings.balanceCents,
};

export const noAccountsMoneySummaryFixture: MoneySummary = { ...moneySummaryFixture, jointBalanceCents: null, savingsBalanceCents: null };

// ── Loans and the income / expenses timeline ────────────────────────────────────────────────────────

const loanOf = (recurring: (typeof recurringFixtures)[keyof typeof recurringFixtures]): MoneyLoans["loans"][number] => ({
  id: recurring.id,
  payee: recurring.payee,
  kind: recurring.kind,
  status: recurring.status,
  amountCents: recurring.amountCents,
  rrule: recurring.rrule,
  monthlyCents: recurring.monthlyCents,
  nextDueDate: recurring.nextDueDate,
  totalOpen: recurring.totalOpen,
});

const runningLoans = [recurringFixtures.houseLoan, recurringFixtures.brackevaWithTotal, recurringFixtures.loan].map(loanOf);

/** Two loans with a total open amount (one partly repaid) and one without. */
export const moneyLoansFixture: MoneyLoans = { today: moneyToday, loans: runningLoans, totals: loanTotals(runningLoans) };
export const emptyMoneyLoansFixture: MoneyLoans = { today: moneyToday, loans: [], totals: loanTotals([]) };

const range = (from: string, months: number) => monthsBetween(from, monthOf(addMonthsClamped(`${from}-01`, months - 1)));

/**
 * 12 months back and 24 ahead around October 2026: salaries (a raise in January), a variable commission at its
 * estimate, fixed costs, one-offs in the past, the house loan ending in February 2027 with a partial last
 * payment and the down payment in February 2027 too, so the expenses step down.
 */
function timelineFixture(): MoneyTimeline {
  const months = range("2025-10", 37);
  const incomes: TimelineIncome[] = months.flatMap((month) => {
    const raise = month >= "2027-01";
    return [
      { date: `${month}-25`, amountCents: raise ? 250_000 : 240_000, received: month < "2026-10", estimate: false },
      { date: `${month}-26`, amountCents: 198_000, received: month < "2026-10", estimate: false },
      ...(month >= "2026-10" ? [{ date: `${month}-28`, amountCents: 30_000, received: false, estimate: true }] : []),
    ];
  });
  const loanAmount = (month: string) => (month < "2027-02" ? 85317 : month === "2027-02" ? 61513 : 0);
  const downPayment = (month: string) => (month >= "2026-10" && month < "2027-02" ? 23000 : month === "2027-02" ? 8000 : 0);
  const expenses: TimelineExpense[] = months.flatMap((month) => {
    const paid = month < "2026-10";
    const items: TimelineExpense[] = [
      { date: `${month}-05`, amountCents: loanAmount(month), paid, recurring: true, kind: "loan" },
      { date: `${month}-01`, amountCents: 48753, paid, recurring: true, kind: "loan" },
      { date: `${month}-25`, amountCents: downPayment(month), paid, recurring: true, kind: "down_payment" },
      { date: `${month}-12`, amountCents: 165_000, paid, recurring: true, kind: "utility" },
      { date: `${month}-15`, amountCents: paid ? 38_000 + (Number(month.slice(5)) % 4) * 9_000 : 0, paid, recurring: false, kind: null },
    ];
    return items.filter((item) => item.amountCents > 0);
  });
  return { today: moneyToday, from: months[0] ?? "2025-10", to: months.at(-1) ?? "2028-10", months: buildMoneyTimeline({ from: "2025-10", to: "2028-10", today: moneyToday, incomes, expenses }) };
}

export const moneyTimelineFixture = timelineFixture();
export const emptyMoneyTimelineFixture: MoneyTimeline = {
  today: moneyToday,
  from: "2025-10",
  to: "2028-10",
  months: buildMoneyTimeline({ from: "2025-10", to: "2028-10", today: moneyToday, incomes: [], expenses: [] }),
};
