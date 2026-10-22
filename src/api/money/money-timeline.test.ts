/**
 * Unit tests for the money flow timeline (income and expenses per month, past and future) and the loans card
 * totals: fixed income with its amount history, a variable income at its estimate, a loan ending with a
 * partial last payment, paused and ended recurring expenses, and the past / current / future split.
 * No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/money/money-timeline.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { incomeFlowItems, type OccurrenceSource } from "@/features/income/types/income-calculations";
import type { Income } from "@/features/income/types/income";
import type { MoneyLoans } from "@/features/money/types/money";
import { buildMoneyTimeline, loanTotals, monthsBetween, type TimelineExpense } from "@/features/money/types/money-timeline";
import { projectedOccurrences } from "../expenses/expenses.calendar";

const TODAY = "2026-10-03";

const source = (patch: Partial<OccurrenceSource> & Pick<OccurrenceSource, "id" | "name">): OccurrenceSource => ({
  kind: "salary",
  habitantId: "h1",
  rrule: "FREQ=MONTHLY",
  startDate: "2026-01-25",
  endDate: null,
  amountMode: "fixed",
  estimateCents: null,
  targetAccountId: null,
  amounts: [],
  ...patch,
});

const income = (patch: Partial<Income> & Pick<Income, "id" | "date" | "amountCents">): Income => ({
  habitantId: "h1",
  kind: "salary",
  description: null,
  sourceId: null,
  periodDate: null,
  targetAccountId: null,
  note: null,
  ...patch,
});

const at = <T extends { month: string }>(rows: T[], month: string) => {
  const row = rows.find((item) => item.month === month);
  assert.ok(row, month);
  return row;
};

describe("timeline: income", () => {
  const salary = source({
    id: "salary",
    name: "Salary",
    amounts: [
      { effectiveFrom: "2026-01-01", amountCents: 240_000 },
      { effectiveFrom: "2027-01-01", amountCents: 245_000 },
    ],
  });
  const bonus = source({ id: "bonus", name: "Commission", kind: "other", amountMode: "variable", estimateCents: 30_000, startDate: "2026-01-28" });
  const vouchers = source({ id: "vouchers", name: "Meal vouchers", kind: "meal_vouchers", amountMode: "variable", estimateCents: 16_000 });
  const incomes = [
    income({ id: "i-sep", date: "2026-09-25", amountCents: 240_000, sourceId: "salary", periodDate: "2026-09-25" }),
    // The salary of 31 August came in on 2 September: it counts in August.
    income({ id: "i-aug", date: "2026-09-02", amountCents: 239_000, sourceId: "salary", periodDate: "2026-08-25" }),
    income({ id: "i-tax", date: "2026-07-10", amountCents: 54_321, kind: "tax_return" }),
    income({ id: "i-vouchers", date: "2026-09-30", amountCents: 16_000, kind: "meal_vouchers", sourceId: "vouchers", periodDate: "2026-09-25" }),
  ];
  const items = incomeFlowItems([salary, bonus, vouchers], incomes, "2026-07-01", "2027-02-28", TODAY);
  const timeline = buildMoneyTimeline({ from: "2026-07", to: "2027-02", today: TODAY, incomes: items, expenses: [] });

  it("counts what came in for past months, on the occurrence it fulfils; missed occurrences don't count", () => {
    assert.equal(at(timeline, "2026-07").incomeCents, 54_321, "only the tax return: the July salary wasn't recorded");
    assert.equal(at(timeline, "2026-08").incomeCents, 239_000);
    assert.equal(at(timeline, "2026-09").incomeCents, 240_000, "meal vouchers are left out");
    assert.equal(at(timeline, "2026-09").period, "past");
  });

  it("projects fixed incomes with their amount history and variable ones at their estimate", () => {
    assert.equal(at(timeline, "2026-10").period, "current");
    assert.equal(at(timeline, "2026-10").incomeCents, 240_000 + 30_000);
    assert.equal(at(timeline, "2026-10").incomeEstimateCents, 30_000);
    assert.equal(at(timeline, "2026-12").incomeCents, 270_000);
    assert.equal(at(timeline, "2027-01").incomeCents, 245_000 + 30_000, "the raise from January");
    assert.equal(at(timeline, "2027-02").period, "future");
  });

  it("projects a future-dated income instead of counting it as received", () => {
    const later = [income({ id: "i-tax-later", date: "2026-12-30", amountCents: 180_000, kind: "tax_return" })];
    const [item] = incomeFlowItems([], later, "2026-10-01", "2026-12-31", TODAY);
    assert.deepEqual(item, { date: "2026-12-30", amountCents: 180_000, received: false, estimate: false });
    assert.equal(at(buildMoneyTimeline({ from: "2026-10", to: "2026-12", today: TODAY, incomes: item ? [item] : [], expenses: [] }), "2026-12").incomeCents, 180_000);
    // On its date it is received.
    assert.equal(incomeFlowItems([], later, "2026-10-01", "2026-12-31", "2026-12-30")[0]?.received, true);
  });

  it("leaves a variable income without an estimate out", () => {
    const none = incomeFlowItems([source({ id: "v", name: "Tips", amountMode: "variable", estimateCents: null })], [], "2026-10-01", "2026-12-31", TODAY);
    assert.deepEqual(none, []);
  });
});

describe("timeline: expenses", () => {
  it("puts paid expenses on their payment date, overdue unpaid ones in the current month", () => {
    const expenses: TimelineExpense[] = [
      { date: "2026-08-30", amountCents: 10_000, paid: true, recurring: false, kind: null },
      { date: "2026-09-15", amountCents: 5_000, paid: false, recurring: false, kind: null }, // overdue
      { date: "2026-10-20", amountCents: 7_000, paid: false, recurring: true, kind: "subscription" },
      { date: "2026-11-01", amountCents: 85_317, paid: false, recurring: true, kind: "loan" },
    ];
    const timeline = buildMoneyTimeline({ from: "2026-08", to: "2026-11", today: TODAY, incomes: [], expenses });
    assert.equal(at(timeline, "2026-08").oneOffCents, 10_000);
    assert.equal(at(timeline, "2026-09").expenseCents, 0);
    assert.equal(at(timeline, "2026-10").expenseCents, 12_000);
    assert.deepEqual([at(timeline, "2026-10").oneOffCents, at(timeline, "2026-10").recurringCents], [5_000, 7_000]);
    assert.equal(at(timeline, "2026-11").loansCents, 85_317);
    assert.equal(at(timeline, "2026-11").netCents, -85_317);
  });

  it("steps down when a loan ends with its partial last payment", () => {
    // € 10.000 open from 5 Nov 2026 at € 853,17: 11 full payments and € 615,13 on 5 Oct 2027. Nothing is
    // generated yet in this test (no horizon), so every occurrence comes from the plan.
    const loan = {
      status: "ACTIVE" as const,
      amountCents: 85317,
      rrule: "FREQ=MONTHLY;UNTIL=20271005",
      startDate: "2026-11-05",
      endDate: null,
      generatedUntil: null,
      totalOpen: { totalOpenCents: 1_000_000, asOf: "2026-11-05", settled: [] },
    };
    const occurrences = projectedOccurrences(loan, "2026-10-01", "2028-03-31");
    assert.equal(occurrences.length, 12);
    const expenses = occurrences.map((occurrence) => ({ date: occurrence.dueDate, amountCents: occurrence.amountCents, paid: false, recurring: true, kind: "loan" }));
    const timeline = buildMoneyTimeline({ from: "2026-10", to: "2027-12", today: TODAY, incomes: [], expenses });
    assert.equal(at(timeline, "2027-09").loansCents, 85317);
    assert.equal(at(timeline, "2027-10").loansCents, 61513, "the partial last payment");
    assert.equal(at(timeline, "2027-11").loansCents, 0, "and then nothing");
    assert.equal(timeline.reduce((sum, month) => sum + month.loansCents, 0), 1_000_000);
  });

  it("projects nothing for paused templates, and nothing after an end date", () => {
    const base = { amountCents: 2000, rrule: "FREQ=MONTHLY", startDate: "2026-01-12", endDate: null, generatedUntil: "2027-10-03", totalOpen: null };
    assert.equal(projectedOccurrences({ ...base, status: "ACTIVE" }, "2027-10-01", "2028-03-31").length, 6);
    assert.deepEqual(projectedOccurrences({ ...base, status: "PAUSED" }, "2027-10-01", "2028-03-31"), []);
    assert.deepEqual(projectedOccurrences({ ...base, status: "ENDED", endDate: "2027-12-31" }, "2027-10-01", "2028-03-31"), []);
    assert.equal(projectedOccurrences({ ...base, status: "ACTIVE", endDate: "2027-12-31" }, "2027-10-01", "2028-03-31").length, 3);
  });
});

describe("timeline: months and loans totals", () => {
  it("lists the months of a range", () => {
    assert.deepEqual(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
    assert.deepEqual(monthsBetween("2027-02", "2026-11"), []);
  });

  it("adds up open, total and repaid over loans with a total, and the monthly cost of active ones", () => {
    const progress = (totalCents: number, paidCents: number) => ({
      totalCents,
      asOf: "2026-03-05",
      paidCents,
      paidCount: 1,
      remainingCents: totalCents - paidCents,
      paymentsLeft: 3,
      nextDate: "2026-11-05",
      lastDate: "2027-02-05",
      lastAmountCents: 100,
    });
    const loan = (id: string, status: "active" | "paused", monthlyCents: number, totalOpen: ReturnType<typeof progress> | null): MoneyLoans["loans"][number] => ({
      id,
      payee: id,
      kind: "loan",
      status,
      amountCents: monthlyCents,
      rrule: "FREQ=MONTHLY",
      monthlyCents,
      nextDueDate: null,
      totalOpen,
    });
    assert.deepEqual(
      loanTotals([loan("a", "active", 85317, progress(1_000_000, 400_000)), loan("b", "paused", 23000, progress(100_000, 0)), loan("c", "active", 48753, null)]),
      { remainingCents: 700_000, totalCents: 1_100_000, repaidCents: 400_000, monthlyCents: 85317 + 48753, trackedCount: 2 },
    );
  });
});
