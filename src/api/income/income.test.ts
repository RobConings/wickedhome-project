/**
 * Unit tests for incomes: the amount history of fixed incomes, planned occurrences (variable ones "to
 * enter" until recorded), month totals, meal voucher balances (FIFO lots that expire after 12 months, split
 * shares) and the voucher task plan. No database needed.
 * Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/income/income.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mealVoucherPortions } from "@/features/expenses/types/expense-calculations";
import { expenseCreateInputSchema, expenseInputSchema } from "@/features/expenses/types/expenses";
import {
  amountEntryOn,
  amountOn,
  buildOccurrences,
  incomeFlowItems,
  isReceived,
  monthRange,
  monthTotals,
  nextOccurrenceOf,
  occurrencesBetween,
  shiftMonth,
  upcomingIncomes,
  voucherBalances,
  type OccurrenceSource,
} from "@/features/income/types/income-calculations";
import { incomeInputSchema, incomeSourceCreateSchema, incomeSourceUpdateSchema, type Income } from "@/features/income/types/income";
import { todayIn } from "@/types/dates";
import { planVoucherTasks, voucherTaskTitle } from "./voucher-tasks";

const salary: OccurrenceSource = {
  id: "salary",
  name: "Loon",
  kind: "salary",
  habitantId: "rob",
  amountMode: "fixed",
  estimateCents: null,
  targetAccountId: null,
  rrule: "FREQ=MONTHLY",
  startDate: "2025-01-31",
  endDate: null,
  amounts: [
    { effectiveFrom: "2025-01-31", amountCents: 238_000 },
    { effectiveFrom: "2026-01-01", amountCents: 245_000 },
  ],
};
const vouchers: OccurrenceSource = {
  ...salary,
  id: "vouchers",
  name: "Maaltijdcheques",
  kind: "meal_vouchers",
  amountMode: "variable",
  estimateCents: 16_000,
  startDate: "2025-01-05",
  amounts: [],
};

const income = (fields: Partial<Income> & Pick<Income, "id" | "date" | "amountCents" | "kind">): Income => ({
  habitantId: "rob",
  description: null,
  sourceId: null,
  periodDate: null,
  targetAccountId: null,
  note: null,
  ...fields,
});

describe("income amount history", () => {
  it("uses the latest amount effective on the date", () => {
    assert.equal(amountOn(salary.amounts, "2025-12-31"), 238_000);
    assert.equal(amountOn(salary.amounts, "2026-01-01"), 245_000);
    assert.equal(amountOn(salary.amounts, "2027-06-30"), 245_000);
    // Before the first entry the first amount applies; nothing without history.
    assert.equal(amountOn(salary.amounts, "2024-01-01"), 238_000);
    assert.equal(amountOn([], "2026-01-01"), null);
    assert.equal(amountEntryOn(salary.amounts, "2026-10-02")?.effectiveFrom, "2026-01-01");
  });

  it("gives each occurrence the amount of its own date", () => {
    const occurrences = buildOccurrences([salary], [], "2025-12-01", "2026-01-31", "2026-10-03");
    assert.deepEqual(
      occurrences.map((occurrence) => [occurrence.date, occurrence.plannedCents]),
      [
        ["2025-12-31", 238_000],
        ["2026-01-31", 245_000],
      ],
    );
  });

  it("clamps the 31st, respects the end date and finds the next date", () => {
    assert.deepEqual(occurrencesBetween(salary, "2026-02-01", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
    assert.deepEqual(occurrencesBetween({ ...salary, endDate: "2026-03-15" }, "2026-02-01", "2026-04-30"), ["2026-02-28"]);
    assert.equal(nextOccurrenceOf(salary, "2026-10-02"), "2026-10-31");
    assert.equal(nextOccurrenceOf({ ...salary, endDate: "2026-09-30" }, "2026-10-02"), null);
  });
});

describe("variable incomes and month totals", () => {
  const { from, to } = monthRange("2026-10");
  /** After everything in these cases happened: all recorded incomes are received. */
  const LATER = "2026-11-05";

  it("a variable occurrence is 'to enter' until its actual amount is recorded", () => {
    const before = buildOccurrences([salary, vouchers], [], from, to, LATER);
    assert.deepEqual(
      before.map((occurrence) => [occurrence.sourceId, occurrence.status, occurrence.plannedCents]),
      [
        ["vouchers", "to_enter", 16_000],
        ["salary", "expected", 245_000],
      ],
    );
    const recorded = income({ id: "i1", date: "2026-10-04", amountCents: 17_600, kind: "meal_vouchers", sourceId: "vouchers", periodDate: "2026-10-05" });
    const after = buildOccurrences([salary, vouchers], [recorded], from, to, LATER);
    assert.equal(after[0]?.status, "received");
    assert.equal(after[0]?.income?.amountCents, 17_600);
  });

  it("counts received + expected per person, vouchers apart, by the period an income belongs to", () => {
    const incomes = [
      // October's salary that came in on 2 November still belongs to October.
      income({ id: "late", date: "2026-11-02", amountCents: 245_500, kind: "salary", sourceId: "salary", periodDate: "2026-10-31" }),
      income({ id: "tax", habitantId: "sofie", date: "2026-10-18", amountCents: 84_312, kind: "tax_return" }),
      income({ id: "gc", habitantId: null, date: "2026-10-30", amountCents: 31_250, kind: "green_certificates" }),
      income({ id: "mv", date: "2026-10-04", amountCents: 17_600, kind: "meal_vouchers", sourceId: "vouchers", periodDate: "2026-10-05" }),
    ];
    const occurrences = buildOccurrences([salary, vouchers], incomes, from, to, LATER);
    const totals = monthTotals("2026-10", occurrences, incomes, LATER);
    const rob = totals.people.find((total) => total.key === "rob");
    assert.deepEqual([rob?.receivedCents, rob?.expectedCents, rob?.totalCents], [245_500, 0, 245_500]);
    assert.equal(totals.people.find((total) => total.key === "joint")?.receivedCents, 31_250);
    assert.equal(totals.household.totalCents, 245_500 + 84_312 + 31_250);
    assert.deepEqual(totals.vouchersCents, { rob: 17_600 });
    // In November the late salary is not counted again.
    const november = monthTotals("2026-11", [], incomes, LATER);
    assert.equal(november.household.receivedCents, 0);
  });

  it("expected uses the fixed amount or the estimate", () => {
    const occurrences = buildOccurrences([salary, { ...vouchers, kind: "bonus", estimateCents: null }], [], from, to, LATER);
    const totals = monthTotals("2026-10", occurrences, [], LATER);
    assert.equal(totals.household.expectedCents, 245_000);
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });
});

describe("received vs expected relative to today", () => {
  const { from, to } = monthRange("2026-10");
  // The real case: on 3 October the salaries are in, the tax returns of 30 October are not.
  const TODAY = "2026-10-03";
  const robSalary = { ...salary, startDate: "2025-01-01", amounts: [{ effectiveFrom: "2025-01-01", amountCents: 342_000 }] };
  const incomes = [
    income({ id: "salary-oct", date: "2026-10-02", amountCents: 342_000, kind: "salary", sourceId: "salary", periodDate: "2026-10-01" }),
    income({ id: "tax-rob", date: "2026-10-30", amountCents: 180_000, kind: "tax_return", description: "Belastingteruggave 2025" }),
    income({ id: "tax-clara", habitantId: "clara", date: "2026-10-30", amountCents: 100_000, kind: "tax_return" }),
    income({ id: "clara-salary", habitantId: "clara", date: "2026-10-01", amountCents: 300_000, kind: "salary" }),
    income({ id: "mv-later", date: "2026-10-20", amountCents: 17_000, kind: "meal_vouchers" }),
  ];

  it("isReceived: today counts as received (inclusive boundary), tomorrow not", () => {
    assert.equal(isReceived({ date: "2026-10-03" }, TODAY), true);
    assert.equal(isReceived({ date: "2026-10-02" }, TODAY), true);
    assert.equal(isReceived({ date: "2026-10-04" }, TODAY), false);
  });

  it("uses the household's day (Europe/Brussels): just after midnight there is already the next day", () => {
    // 2 October 22:30 UTC is 3 October 00:30 in Brussels (CEST, UTC+2).
    const brusselsToday = todayIn("Europe/Brussels", new Date("2026-10-02T22:30:00Z"));
    assert.equal(brusselsToday, "2026-10-03");
    assert.equal(isReceived({ date: "2026-10-03" }, brusselsToday), true);
    assert.equal(isReceived({ date: "2026-10-03" }, todayIn("UTC", new Date("2026-10-02T22:30:00Z"))), false);
  });

  it("counts future-dated incomes as expected in the month totals, not as received", () => {
    const occurrences = buildOccurrences([robSalary], incomes, from, to, TODAY);
    const totals = monthTotals("2026-10", occurrences, incomes, TODAY);
    const rob = totals.people.find((total) => total.key === "rob");
    const clara = totals.people.find((total) => total.key === "clara");
    assert.deepEqual([rob?.receivedCents, rob?.expectedCents, rob?.totalCents], [342_000, 180_000, 522_000]);
    assert.deepEqual([clara?.receivedCents, clara?.expectedCents], [300_000, 100_000]);
    assert.deepEqual([totals.household.receivedCents, totals.household.expectedCents], [642_000, 280_000]);
    // Meal vouchers dated later are not received yet either.
    assert.deepEqual(totals.vouchersCents, {});
    // On the 30th itself they are received.
    const onTheDay = monthTotals("2026-10", buildOccurrences([robSalary], incomes, from, to, "2026-10-30"), incomes, "2026-10-30");
    assert.equal(onTheDay.household.receivedCents, 922_000);
    assert.equal(onTheDay.household.expectedCents, 0);
  });

  it("an amount entered ahead for an occurrence is 'upcoming' until its date", () => {
    const early = income({ id: "early", date: "2026-10-31", amountCents: 342_000, kind: "salary", sourceId: "salary", periodDate: "2026-10-31" });
    const [occurrence] = buildOccurrences([salary], [early], from, to, TODAY);
    assert.equal(occurrence?.status, "upcoming");
    assert.equal(occurrence?.income?.id, "early");
    assert.equal(buildOccurrences([salary], [early], from, to, "2026-10-31")[0]?.status, "received");
    const totals = monthTotals("2026-10", occurrence ? [occurrence] : [], [early], TODAY);
    assert.deepEqual([totals.household.receivedCents, totals.household.expectedCents], [0, 342_000]);
  });

  it("lists future-dated one-offs of the month for the planned list, oldest first", () => {
    const occurrences = buildOccurrences([robSalary], incomes, from, to, TODAY);
    assert.deepEqual(upcomingIncomes("2026-10", occurrences, incomes, TODAY).map((item) => item.id), ["mv-later", "tax-clara", "tax-rob"]);
    assert.deepEqual(upcomingIncomes("2026-11", occurrences, incomes, TODAY), []);
    assert.deepEqual(upcomingIncomes("2026-10", occurrences, incomes, "2026-10-30"), []);
  });

  it("projects future-dated incomes in the income flow instead of counting them as received", () => {
    const items = incomeFlowItems([], incomes, from, to, TODAY);
    assert.deepEqual(
      items.map((item) => [item.date, item.amountCents, item.received]),
      [
        ["2026-10-01", 342_000, true],
        ["2026-10-30", 180_000, false],
        ["2026-10-30", 100_000, false],
        ["2026-10-01", 300_000, true],
      ],
    );
  });

  it("does not make future-dated meal vouchers available yet", () => {
    const lots = [{ habitantId: "rob", date: "2026-10-03", amountCents: 17_000, kind: "meal_vouchers" as const }, { habitantId: "rob", date: "2026-10-20", amountCents: 16_000, kind: "meal_vouchers" as const }];
    assert.equal(voucherBalances(lots, [], TODAY)[0]?.availableCents, 17_000);
    assert.equal(voucherBalances(lots, [], "2026-10-20")[0]?.availableCents, 33_000);
  });
});

describe("meal voucher balance", () => {
  const TODAY = "2026-10-03";
  const lot = (habitantId: string | null, date: string, amountCents: number, kind: Income["kind"] = "meal_vouchers") => ({ habitantId, date, amountCents, kind });
  const spend = (habitantId: string, date: string, amountCents: number) => ({ habitantId, date, amountCents });
  const balanceOf = (balances: ReturnType<typeof voucherBalances>, habitantId: string) => balances.find((balance) => balance.habitantId === habitantId);

  const expenses = [
    { paymentMethod: "meal_voucher", paidOn: "2026-10-01", payerType: "person" as const, payerHabitantId: "rob", shares: [], amountCents: 8_430 },
    {
      paymentMethod: "meal_voucher",
      paidOn: "2026-10-02",
      payerType: "split" as const,
      payerHabitantId: null,
      shares: [
        { habitantId: "rob", amountCents: 3_001 },
        { habitantId: "sofie", amountCents: 3_000 },
      ],
      amountCents: 6_001,
    },
    // An older joint one counts for whoever marked it paid.
    { paymentMethod: "meal_voucher", paidOn: "2026-10-02", payerType: "joint" as const, payerHabitantId: null, paidById: "sofie", shares: [], amountCents: 1_200 },
    // Not counted: unpaid, another method, or joint without anyone who paid.
    { paymentMethod: "meal_voucher", paidOn: null, payerType: "person" as const, payerHabitantId: "rob", shares: [], amountCents: 9_999 },
    { paymentMethod: "card", paidOn: "2026-10-02", payerType: "person" as const, payerHabitantId: "rob", shares: [], amountCents: 9_999 },
    { paymentMethod: "meal_voucher", paidOn: "2026-10-02", payerType: "joint" as const, payerHabitantId: null, paidById: null, shares: [], amountCents: 9_999 },
  ];

  it("counts what each person paid with vouchers and when: own, split shares, joint by who paid", () => {
    assert.deepEqual(mealVoucherPortions(expenses), [
      { habitantId: "rob", amountCents: 8_430, date: "2026-10-01" },
      { habitantId: "rob", amountCents: 3_001, date: "2026-10-02" },
      { habitantId: "sofie", amountCents: 3_000, date: "2026-10-02" },
      { habitantId: "sofie", amountCents: 1_200, date: "2026-10-02" },
    ]);
  });

  it("subtracts split shares from each person's own lots", () => {
    const balances = voucherBalances(
      [lot("rob", "2026-09-04", 17_600), lot("sofie", "2026-09-04", 5_000), lot("rob", "2026-09-25", 245_000, "salary"), lot(null, "2026-09-04", 5_000)],
      mealVoucherPortions(expenses),
      TODAY,
    );
    assert.deepEqual(balanceOf(balances, "rob"), {
      habitantId: "rob",
      receivedCents: 17_600,
      spentCents: 11_431,
      availableCents: 6_169,
      expiredCents: 0,
      uncoveredCents: 0,
      balanceCents: 6_169,
      nextExpiry: { date: "2027-09-04", amountCents: 6_169 },
      expiringSoon: null,
    });
    assert.equal(balanceOf(balances, "sofie")?.availableCents, 800);
    assert.equal(balances.length, 2, "salary and joint vouchers are left out");
  });

  it("uses the oldest valid lot first, across lots, with partial consumption", () => {
    const [rob] = voucherBalances(
      [lot("rob", "2026-03-05", 10_000), lot("rob", "2026-01-05", 10_000), lot("rob", "2026-02-05", 10_000)],
      [spend("rob", "2026-04-01", 15_000), spend("rob", "2026-05-01", 2_000)],
      TODAY,
    );
    // January's lot is used up, 7 000 of February's: 3 000 left of it, March's untouched.
    assert.equal(rob?.availableCents, 13_000);
    assert.deepEqual(rob?.nextExpiry, { date: "2027-02-05", amountCents: 3_000 });
  });

  it("vouchers can be used up to and including the same date 12 months later, not a day more", () => {
    const lots = [lot("rob", "2025-10-03", 5_000)];
    const onLastDay = voucherBalances(lots, [spend("rob", "2026-10-03", 2_000)], TODAY);
    assert.equal(onLastDay[0]?.availableCents, 3_000);
    assert.deepEqual(onLastDay[0]?.expiringSoon, { date: "2026-10-03", amountCents: 3_000 });
    const dayAfter = voucherBalances(lots, [spend("rob", "2026-10-04", 2_000)], "2026-10-04");
    assert.equal(dayAfter[0]?.expiredCents, 5_000);
    assert.equal(dayAfter[0]?.uncoveredCents, 2_000);
    assert.equal(dayAfter[0]?.balanceCents, -2_000);
    // 29 February clamps to 28 February.
    assert.equal(voucherBalances([lot("rob", "2024-02-29", 100)], [], "2025-02-28")[0]?.availableCents, 100);
    assert.equal(voucherBalances([lot("rob", "2024-02-29", 100)], [], "2025-03-01")[0]?.expiredCents, 100);
  });

  it("skips expired lots when spending, and never uses vouchers before they arrived", () => {
    const [rob] = voucherBalances(
      [lot("rob", "2025-01-10", 4_000), lot("rob", "2026-02-10", 6_000)],
      [spend("rob", "2026-02-01", 1_000), spend("rob", "2026-03-01", 5_000)],
      TODAY,
    );
    // 1 Feb 2026: the 2025 lot expired on 10 Jan 2026 and the new one wasn't there yet.
    assert.equal(rob?.uncoveredCents, 1_000);
    assert.equal(rob?.expiredCents, 4_000);
    assert.equal(rob?.availableCents, 1_000);
  });

  it("warns 30 days ahead, and ignores what lies after today", () => {
    const lots = [lot("rob", "2025-11-02", 3_000), lot("rob", "2025-11-03", 2_000), lot("rob", "2026-10-10", 9_000)];
    const [rob] = voucherBalances(lots, [spend("rob", "2026-10-20", 9_000)], TODAY);
    assert.deepEqual(rob?.expiringSoon, { date: "2026-11-02", amountCents: 3_000 });
    assert.equal(rob?.receivedCents, 5_000);
    assert.equal(rob?.spentCents, 0);
    assert.equal(voucherBalances(lots, [], "2026-10-02")[0]?.expiringSoon, null, "31 days ahead: no warning yet");
  });
});

describe("meal vouchers need a person", () => {
  const input = { payee: "Delhaize", amountCents: 4_520, dueDate: "2026-10-03", paidOn: "2026-10-03", category: "groceries", paymentMethod: "meal_voucher" };

  it("refuses a new or edited expense paid with meal vouchers from the joint account", () => {
    const joint = expenseCreateInputSchema.safeParse({ ...input, payerType: "joint" });
    assert.equal(joint.success, false);
    assert.deepEqual(joint.error?.issues.map((issue) => issue.path.join(".")), ["payerType"]);
    assert.equal(expenseInputSchema.safeParse({ ...input, payerType: "joint" }).success, false);
    assert.equal(expenseCreateInputSchema.safeParse({ ...input, payerType: "person", payerHabitantId: "rob" }).success, true);
    assert.equal(expenseCreateInputSchema.safeParse({ ...input, paymentMethod: "card", payerType: "joint" }).success, true);
  });
});

describe("meal voucher tasks", () => {
  const balance = (habitantId: string, date: string | null, amountCents = 2_340) => ({ habitantId, expiringSoon: date ? { date, amountCents } : null });

  it("plans one task per person with vouchers expiring soon, titled in the household language", () => {
    const plan = planVoucherTasks([balance("rob", "2026-10-20"), balance("sofie", null)], [], "2026-10-03", "en");
    assert.deepEqual(plan.upserts, [{ id: "rob:2026-10-20", habitantId: "rob", date: "2026-10-20", title: voucherTaskTitle(2_340, "2026-10-20", "en") }]);
    // Same money format as the "Pay …" tasks (Node's en-BE: €23.40).
    assert.match(voucherTaskTitle(2_340, "2026-10-20", "en"), /^Use € ?23[.,]40 meal vouchers before 20\/10\/2026$/);
    assert.match(voucherTaskTitle(2_340, "2026-10-20", "nl"), /^€ 23,40 maaltijdcheques gebruiken vóór 20\/10\/2026$/);
  });

  it("closes tasks whose vouchers were used, removes those that expired, leaves closed ones", () => {
    const existing = [
      { originId: "rob:2026-10-20", originDate: "2026-10-20", status: "open" as const },
      { originId: "sofie:2026-10-10", originDate: "2026-10-10", status: "open" as const },
      { originId: "lotte:2026-09-30", originDate: "2026-09-30", status: "open" as const },
      { originId: "jan:2026-09-01", originDate: "2026-09-01", status: "done" as const },
    ];
    const plan = planVoucherTasks([balance("rob", "2026-10-20")], existing, "2026-10-03", "en");
    assert.deepEqual(plan.settle, [
      { id: "sofie:2026-10-10", outcome: "done" },
      { id: "lotte:2026-09-30", outcome: "removed" },
    ]);
  });
});

describe("income input schemas", () => {
  const source = { name: "Loon", kind: "salary", rrule: "FREQ=MONTHLY", startDate: "2026-01-25" };

  it("a fixed source needs an amount on create, not on edit; 'joint' means no habitant", () => {
    assert.equal(incomeSourceCreateSchema.safeParse(source).success, false);
    const created = incomeSourceCreateSchema.parse({ ...source, amountCents: "245000", habitantId: "joint", targetAccountId: "none" });
    assert.deepEqual([created.habitantId, created.targetAccountId, created.amountMode], [null, null, "fixed"]);
    assert.equal(incomeSourceCreateSchema.safeParse({ ...source, amountMode: "variable" }).success, true);
    assert.equal(incomeSourceUpdateSchema.safeParse(source).success, true);
    assert.equal(incomeSourceCreateSchema.safeParse({ ...source, amountCents: "1", endDate: "2025-12-31" }).success, false);
    assert.equal(incomeSourceCreateSchema.safeParse({ ...source, amountCents: "1", rrule: "FREQ=DAILY" }).success, false);
  });

  it("a period belongs to a recurring income", () => {
    const base = { date: "2026-10-02", amountCents: "1000", kind: "tax_return" };
    assert.equal(incomeInputSchema.safeParse(base).success, true);
    assert.equal(incomeInputSchema.safeParse({ ...base, periodDate: "2026-10-01" }).success, false);
    assert.equal(incomeInputSchema.safeParse({ ...base, periodDate: "2026-10-01", sourceId: "s1" }).success, true);
  });
});
