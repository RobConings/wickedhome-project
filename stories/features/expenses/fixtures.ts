import { computeExpenseTotals, computeRecurringTotals, exactYearlyCents, expenseStatus } from "@/features/expenses/types/expense-calculations";
import type {
  Expense,
  ExpenseDetail,
  ExpensesOverview,
  ExpensesSummary,
  PayeeSuggestion,
  RecurringExpense,
  RecurringExpenseDetail,
} from "@/features/expenses/types/expenses";
import { totalOpenProgress } from "@/features/expenses/types/total-open";
import type { Habitant } from "@/features/household/types/household";
import { habitantFixtures } from "../household/fixtures";
import { shopFixtures, shopListFixture } from "../shops/fixtures";

/** Example data for stories and tests, pinned to the same day as the other features. */
export const expensesToday = "2026-10-02";

export const expenseHabitants: Habitant[] = Object.values(habitantFixtures);
export const expenseShops = shopListFixture;

const { owner, partner } = habitantFixtures;

const expense = (patch: Partial<Expense> & Pick<Expense, "id" | "payee" | "amountCents" | "dueDate">): Expense => {
  const paidOn = patch.paidOn ?? null;
  return {
    project: null,
    recurringExpenseId: null,
    rrule: null,
    kind: null,
    description: null,
    category: "other",
    shopId: null,
    paymentMethod: null,
    beneficiaryName: null,
    iban: null,
    bic: null,
    structuredCommunication: null,
    reference: null,
    payerType: "joint",
    payerHabitantId: null,
    shares: [],
    notes: null,
    paidById: null,
    autoPaid: false,
    ...patch,
    paidOn,
    status: expenseStatus({ dueDate: patch.dueDate, paidOn }, expensesToday),
  };
};

export const expenseFixtures = {
  /** A bill to pay by transfer with a structured communication: shows the payment QR. */
  watergroep: expense({
    id: "e-watergroep",
    payee: "De Watergroep",
    description: "Water bill 2026",
    amountCents: 56206,
    dueDate: "2026-10-09",
    category: "water",
    paymentMethod: "wire_transfer",
    beneficiaryName: "De Watergroep",
    iban: "BE68539007547034",
    bic: "GKCCBEBB",
    structuredCommunication: "123456789002",
  }),
  /** Free-text reference, paid by one person. */
  hendrickx: expense({
    id: "e-hendrickx",
    payee: "Hendrickx",
    description: "Kitchen worktop",
    amountCents: 147152,
    dueDate: "2026-09-28",
    category: "housing",
    paymentMethod: "wire_transfer",
    iban: "BE71096123456769",
    reference: "Invoice 2026-104",
    payerType: "person",
    payerHabitantId: owner.id,
  }),
  /** Split between the two adults. */
  verisure: expense({
    id: "e-verisure",
    payee: "Verisure",
    amountCents: 22366,
    dueDate: "2026-10-15",
    category: "housing",
    paymentMethod: "direct_debit",
    payerType: "split",
    shares: [
      { habitantId: owner.id, amountCents: 11183 },
      { habitantId: partner.id, amountCents: 11183 },
    ],
  }),
  /** Instance of a recurring loan, direct debit. */
  loanOctober: expense({
    id: "e-loan-10",
    payee: "Lening : huis",
    amountCents: 85317,
    dueDate: "2026-11-01",
    category: "loans",
    recurringExpenseId: "r-loan",
    rrule: "FREQ=MONTHLY",
    kind: "loan",
    paymentMethod: "direct_debit",
  }),
  /** Paid automatically by the direct-debit job. */
  luminusPaid: expense({
    id: "e-luminus-09",
    payee: "Luminus",
    amountCents: 22500,
    dueDate: "2026-09-22",
    category: "energy",
    recurringExpenseId: "r-luminus",
    rrule: "FREQ=MONTHLY",
    kind: "subscription",
    paymentMethod: "direct_debit",
    paidOn: "2026-09-22",
    autoPaid: true,
  }),
  /** Everyday spending logged as paid, at a shop. */
  groceries: expense({
    id: "e-colruyt",
    payee: "Colruyt",
    amountCents: 8734,
    dueDate: "2026-10-01",
    category: "groceries",
    shopId: shopFixtures.colruyt.id,
    paymentMethod: "meal_voucher",
    payerType: "person",
    payerHabitantId: partner.id,
    paidOn: "2026-10-01",
    paidById: partner.id,
  }),
};

const recurring = (
  patch: Partial<RecurringExpense> & Pick<RecurringExpense, "id" | "payee" | "amountCents" | "rrule" | "kind">,
): RecurringExpense => {
  const yearly = exactYearlyCents(patch.amountCents, patch.rrule);
  return {
    project: null,
    description: null,
    category: "other",
    status: "active",
    startDate: "2026-01-01",
    endDate: null,
    paymentMethod: null,
    beneficiaryName: null,
    iban: null,
    bic: null,
    structuredCommunication: null,
    reference: null,
    payerType: "joint",
    payerHabitantId: null,
    shares: [],
    notes: null,
    websiteUrl: null,
    trialEndsOn: null,
    inTrial: false,
    remindDaysBefore: null,
    reminderOn: null,
    candidateToCancel: false,
    nextDueDate: null,
    monthlyCents: Math.round(yearly / 12),
    yearlyCents: Math.round(yearly),
    totalOpen: null,
    ...patch,
  };
};

/** Monthly instances on `day` from `first` (YYYY-MM) for `months` months, paid up to and including `paidUntil`. */
const loanInstances = (first: string, months: number, day: number, amountCents: number, paidUntil: string) =>
  Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + index, day));
    const dueDate = date.toISOString().slice(0, 10);
    return { dueDate, amountCents, paid: dueDate <= paidUntil };
  });

/**
 * € 10.000,00 open from 5 March 2026 at € 853,17 a month: 12 payments, 11 × € 853,17 + last € 615,13.
 * Seven are paid, so € 4.027,81 is left in 5 payments, the last on 5 February 2027.
 */
const houseLoanProgress = totalOpenProgress({
  amountCents: 85317,
  totalOpenCents: 1_000_000,
  asOf: "2026-03-05",
  rrule: "FREQ=MONTHLY;UNTIL=20270205",
  startDate: "2025-03-05",
  generatedUntil: "2026-10-31",
  status: "active",
  instances: loanInstances("2026-03", 8, 5, 85317, "2026-09-30"),
});

/** € 1.000,00 open at € 230,00 a month from 25 October 2026: 4 × € 230,00 + last € 80,00, nothing paid yet. */
const brackevaProgress = totalOpenProgress({
  amountCents: 23000,
  totalOpenCents: 100_000,
  asOf: "2026-10-25",
  rrule: "FREQ=MONTHLY;UNTIL=20270225",
  startDate: "2026-01-25",
  generatedUntil: "2026-10-31",
  status: "active",
  instances: [{ dueDate: "2026-10-25", amountCents: 23000, paid: false }],
});

export const recurringFixtures = {
  loan: recurring({
    id: "r-loan",
    payee: "Lening : huis",
    amountCents: 85317,
    rrule: "FREQ=MONTHLY;UNTIL=20450101",
    kind: "loan",
    category: "loans",
    paymentMethod: "direct_debit",
    nextDueDate: "2026-11-01",
  }),
  luminus: recurring({
    id: "r-luminus",
    payee: "Luminus",
    amountCents: 22500,
    rrule: "FREQ=MONTHLY",
    kind: "utility",
    category: "energy",
    paymentMethod: "direct_debit",
    websiteUrl: "https://www.luminus.be",
    nextDueDate: "2026-10-22",
  }),
  brackeva: recurring({
    id: "r-brackeva",
    payee: "Afbetaling: Brackeva",
    amountCents: 23000,
    rrule: "FREQ=MONTHLY",
    kind: "down_payment",
    category: "loans",
    paymentMethod: "wire_transfer",
    iban: "BE68539007547034",
    structuredCommunication: "123456789002",
    payerType: "person",
    payerHabitantId: owner.id,
    remindDaysBefore: 1,
    reminderOn: "2026-10-24",
    nextDueDate: "2026-10-25",
  }),
  netflix: recurring({
    id: "r-netflix",
    payee: "Netflix",
    amountCents: 1799,
    rrule: "FREQ=MONTHLY",
    kind: "subscription",
    category: "subscriptions",
    paymentMethod: "card",
    candidateToCancel: true,
    websiteUrl: "https://www.netflix.com",
    nextDueDate: "2026-10-12",
  }),
  insurance: recurring({
    id: "r-insurance",
    payee: "AG brandverzekering",
    amountCents: 38460,
    rrule: "FREQ=YEARLY",
    kind: "insurance",
    category: "insurance",
    status: "paused",
  }),
  gym: recurring({
    id: "r-gym",
    payee: "Basic-Fit",
    amountCents: 2999,
    rrule: "FREQ=MONTHLY",
    kind: "subscription",
    category: "leisure",
    status: "ended",
    endDate: "2026-06-30",
  }),
  /** A loan with a total open amount: progress, payments to go, partial last payment. */
  houseLoan: recurring({
    id: "r-house-loan",
    payee: "Lening : huis",
    amountCents: 85317,
    rrule: "FREQ=MONTHLY;UNTIL=20270205",
    startDate: "2025-03-05",
    kind: "loan",
    category: "loans",
    paymentMethod: "direct_debit",
    nextDueDate: "2026-10-05",
    totalOpen: houseLoanProgress,
  }),
  /** A down payment with a total open amount, paid by transfer. */
  brackevaWithTotal: recurring({
    id: "r-brackeva-total",
    payee: "Afbetaling: Brackeva",
    amountCents: 23000,
    rrule: "FREQ=MONTHLY;UNTIL=20270225",
    startDate: "2026-01-25",
    kind: "down_payment",
    category: "loans",
    paymentMethod: "wire_transfer",
    iban: "BE68539007547034",
    structuredCommunication: "123456789002",
    nextDueDate: "2026-10-25",
    totalOpen: brackevaProgress,
  }),
};

export const payeeFixtures: PayeeSuggestion[] = [
  { name: "De Watergroep", category: "water", paymentMethod: "wire_transfer", beneficiaryName: "De Watergroep", iban: "BE68539007547034", bic: null, lastUsedOn: "2026-10-09" },
  { name: "Luminus", category: "energy", paymentMethod: "direct_debit", beneficiaryName: null, iban: null, bic: null, lastUsedOn: "2026-09-22" },
];

const allExpenses = Object.values(expenseFixtures).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
const allRecurring = Object.values(recurringFixtures);

export const expensesOverviewFixture: ExpensesOverview = {
  today: expensesToday,
  expenses: allExpenses,
  recurring: allRecurring,
  payees: payeeFixtures,
  totals: computeExpenseTotals(allExpenses, expensesToday),
  recurringTotals: computeRecurringTotals(allRecurring),
};

export const emptyExpensesOverviewFixture: ExpensesOverview = {
  today: expensesToday,
  expenses: [],
  recurring: [],
  payees: [],
  totals: computeExpenseTotals([], expensesToday),
  recurringTotals: computeRecurringTotals([]),
};

export const expenseDetailFixture: ExpenseDetail = {
  today: expensesToday,
  expense: expenseFixtures.watergroep,
  recurring: null,
  history: [],
};

export const recurringExpenseDetailFixture: RecurringExpenseDetail = {
  today: expensesToday,
  recurring: recurringFixtures.brackeva,
  upcoming: [
    expense({ id: "e-br-10", payee: "Afbetaling: Brackeva", amountCents: 23000, dueDate: "2026-10-25", recurringExpenseId: "r-brackeva", rrule: "FREQ=MONTHLY", kind: "down_payment", paymentMethod: "wire_transfer", iban: "BE68539007547034", structuredCommunication: "123456789002" }),
    expense({ id: "e-br-11", payee: "Afbetaling: Brackeva", amountCents: 23000, dueDate: "2026-11-25", recurringExpenseId: "r-brackeva", rrule: "FREQ=MONTHLY", kind: "down_payment" }),
  ],
  history: [
    expense({ id: "e-br-09", payee: "Afbetaling: Brackeva", amountCents: 23000, dueDate: "2026-09-25", paidOn: "2026-09-24", paidById: owner.id, recurringExpenseId: "r-brackeva" }),
  ],
};

const houseLoanInstance = (month: string, paid: boolean) =>
  expense({
    id: `e-house-${month}`,
    payee: "Lening : huis",
    amountCents: 85317,
    dueDate: `2026-${month}-05`,
    category: "loans",
    recurringExpenseId: "r-house-loan",
    rrule: "FREQ=MONTHLY;UNTIL=20270205",
    kind: "loan",
    paymentMethod: "direct_debit",
    ...(paid && { paidOn: `2026-${month}-05`, autoPaid: true }),
  });

/** A loan with a total open amount: progress bar, payments to go, last (partial) payment. */
export const recurringLoanDetailFixture: RecurringExpenseDetail = {
  today: expensesToday,
  recurring: recurringFixtures.houseLoan,
  upcoming: [houseLoanInstance("10", false)],
  history: ["09", "08", "07", "06", "05", "04", "03"].map((month) => houseLoanInstance(month, true)),
};

const unpaid = allExpenses.filter((item) => !item.paidOn);
export const expensesSummaryFixture: ExpensesSummary = {
  today: expensesToday,
  upcoming: unpaid,
  dueThisWeek: { count: 1, totalCents: expenseFixtures.watergroep.amountCents },
  overdue: { count: 1, totalCents: expenseFixtures.hendrickx.amountCents },
  recurring: computeRecurringTotals(allRecurring),
};

export const emptyExpensesSummaryFixture: ExpensesSummary = {
  today: expensesToday,
  upcoming: [],
  dueThisWeek: { count: 0, totalCents: 0 },
  overdue: { count: 0, totalCents: 0 },
  recurring: computeRecurringTotals([]),
};
