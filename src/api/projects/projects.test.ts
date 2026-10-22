/**
 * Unit tests for projects: budget maths (spent / committed / remaining, the double-count rule, status
 * thresholds), material prices, bar segments, ordering and month helpers, the calendar items and the form schema.
 * No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/projects/projects.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AT_RISK_RATIO,
  budgetBarSegments,
  budgetStatus,
  computeProjectBudget,
  materialLine,
} from "@/features/projects/types/project-budget";
import { monthRange, overlapsMonth, projectFormSchema, projectInputSchema } from "@/features/projects/types/projects";
import { chainDepths } from "@/features/tasks/types/task-chain";
import { projectCalendarItems } from "./projects.calendar";

describe("computeProjectBudget", () => {
  it("adds paid expenses and bought materials to spent, unpaid expenses and open materials to committed", () => {
    const budget = computeProjectBudget(
      100_000,
      [
        { amountCents: 20_000, paid: true },
        { amountCents: 15_000, paid: false },
      ],
      [
        { bought: true, lineCents: 5_000, loggedAsExpense: false },
        { bought: false, lineCents: 7_500, loggedAsExpense: false },
      ],
    );
    assert.equal(budget.spentCents, 25_000);
    assert.equal(budget.committedCents, 22_500);
    assert.equal(budget.remainingCents, 52_500);
    assert.equal(budget.status, "in_budget");
    assert.equal(budget.overByCents, 0);
    assert.deepEqual(budget.breakdown, {
      expensesPaidCents: 20_000,
      expensesUnpaidCents: 15_000,
      materialsBoughtCents: 5_000,
      materialsOpenCents: 7_500,
    });
  });

  it("counts a purchase logged as an expense once: as the expense, not the item", () => {
    const budget = computeProjectBudget(
      50_000,
      [{ amountCents: 12_000, paid: true }],
      [
        { bought: true, lineCents: 12_000, loggedAsExpense: true },
        { bought: false, lineCents: 3_000, loggedAsExpense: true },
      ],
    );
    assert.equal(budget.spentCents, 12_000);
    assert.equal(budget.committedCents, 0);
    assert.equal(budget.unpricedMaterials, 0);
  });

  it("leaves materials without a price out of the sums and counts them as unpriced", () => {
    const budget = computeProjectBudget(
      10_000,
      [],
      [
        { bought: false, lineCents: null, loggedAsExpense: false },
        { bought: true, lineCents: null, loggedAsExpense: false },
        { bought: false, lineCents: 1_000, loggedAsExpense: false },
      ],
    );
    assert.equal(budget.committedCents, 1_000);
    assert.equal(budget.spentCents, 0);
    assert.equal(budget.unpricedMaterials, 2);
  });

  it("is over budget, by how much, when spent + committed exceed the budget", () => {
    const budget = computeProjectBudget(10_000, [{ amountCents: 8_000, paid: true }, { amountCents: 4_500, paid: false }], []);
    assert.equal(budget.status, "over_budget");
    assert.equal(budget.remainingCents, -2_500);
    assert.equal(budget.overByCents, 2_500);
    assert.equal(budget.usedRatio, 1.25);
  });

  it("has no status or remaining without a budget", () => {
    const budget = computeProjectBudget(null, [{ amountCents: 8_000, paid: true }], []);
    assert.equal(budget.status, "no_budget");
    assert.equal(budget.remainingCents, null);
    assert.equal(budget.usedRatio, null);
    assert.equal(budget.overByCents, 0);
  });
});

describe("budgetStatus", () => {
  it("is in budget up to and including 90 %", () => {
    assert.equal(AT_RISK_RATIO, 0.9);
    assert.equal(budgetStatus(10_000, 0), "in_budget");
    assert.equal(budgetStatus(10_000, 9_000), "in_budget");
  });

  it("is at risk above 90 % and up to 100 %", () => {
    assert.equal(budgetStatus(10_000, 9_001), "at_risk");
    assert.equal(budgetStatus(10_000, 10_000), "at_risk");
  });

  it("is over budget above 100 %", () => {
    assert.equal(budgetStatus(10_000, 10_001), "over_budget");
  });

  it("treats a budget of 0 as over as soon as anything costs money", () => {
    assert.equal(budgetStatus(0, 0), "in_budget");
    assert.equal(budgetStatus(0, 1), "over_budget");
  });
});

describe("materialLine", () => {
  it("uses the item's own price times the quantity", () => {
    assert.deepEqual(materialLine({ priceCents: 1_299, quantity: 3, shopId: null, productPrices: [] }), { lineCents: 3_897, source: "item" });
  });

  it("rounds decimal quantities to cents", () => {
    assert.deepEqual(materialLine({ priceCents: 999, quantity: 1.5, shopId: null, productPrices: [] }), { lineCents: 1_499, source: "item" });
  });

  it("falls back to the product's price at the item's shop, then its lowest price", () => {
    const productPrices = [
      { shopId: "brico", priceCents: 2_500 },
      { shopId: "gamma", priceCents: 2_200 },
      { shopId: "hubo", priceCents: null },
    ];
    assert.deepEqual(materialLine({ priceCents: null, quantity: 2, shopId: "brico", productPrices }), { lineCents: 5_000, source: "product" });
    assert.deepEqual(materialLine({ priceCents: null, quantity: 2, shopId: "hubo", productPrices }), { lineCents: 4_400, source: "product" });
    assert.deepEqual(materialLine({ priceCents: null, quantity: 1, shopId: null, productPrices }), { lineCents: 2_200, source: "product" });
  });

  it("has no price when nothing is known", () => {
    assert.deepEqual(materialLine({ priceCents: null, quantity: 1, shopId: null, productPrices: [{ shopId: "x", priceCents: null }] }), {
      lineCents: null,
      source: null,
    });
  });
});

describe("budgetBarSegments", () => {
  it("shows parts of the budget", () => {
    assert.deepEqual(budgetBarSegments({ budgetCents: 10_000, spentCents: 2_500, committedCents: 5_000 }), { spent: 25, committed: 50 });
  });

  it("scales to the total when over budget, so the segments fill the bar", () => {
    const segments = budgetBarSegments({ budgetCents: 10_000, spentCents: 15_000, committedCents: 5_000 });
    assert.equal(segments.spent, 75);
    assert.equal(segments.committed, 25);
  });

  it("is empty without anything", () => {
    assert.deepEqual(budgetBarSegments({ budgetCents: null, spentCents: 0, committedCents: 0 }), { spent: 0, committed: 0 });
  });
});

describe("months", () => {
  it("gives the first and last day of a month", () => {
    assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
    assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
    assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
  });

  it("tells whether a project runs in a month", () => {
    assert.equal(overlapsMonth({ startDate: null, endDate: null }, "2026-10"), true);
    assert.equal(overlapsMonth({ startDate: "2026-10-31", endDate: null }, "2026-10"), true);
    assert.equal(overlapsMonth({ startDate: "2026-11-01", endDate: null }, "2026-10"), false);
    assert.equal(overlapsMonth({ startDate: null, endDate: "2026-09-30" }, "2026-10"), false);
    assert.equal(overlapsMonth({ startDate: "2026-09-15", endDate: "2026-10-01" }, "2026-10"), true);
  });
});

describe("projectInputSchema", () => {
  it("refuses an end date before the start date", () => {
    const result = projectInputSchema.safeParse({ name: "Bathroom", color: "#124734", startDate: "2026-10-10", endDate: "2026-10-01" });
    assert.equal(result.success, false);
    assert.equal(result.error?.issues[0]?.message, "endBeforeStart");
  });

  it("reads the places of the form as a comma-separated field", () => {
    const result = projectFormSchema.parse({ name: "Bathroom", color: "#124734", placeIds: "a,b", budgetCents: "250000" });
    assert.deepEqual(result.placeIds, ["a", "b"]);
    assert.equal(result.budgetCents, 250_000);
    assert.equal(result.status, "planned");
  });
});

describe("chainDepths", () => {
  const ref = (id: string) => ({ id, title: id, status: "open" as const, dueDate: null });

  it("orders a chain of blocked-by links: buy materials → remove tiles → start tiling", () => {
    const depths = chainDepths([
      { id: "tiling", waitingFor: [ref("remove")] },
      { id: "buy", waitingFor: [] },
      { id: "remove", waitingFor: [ref("buy")] },
    ]);
    assert.deepEqual(Object.fromEntries(depths), { tiling: 2, buy: 0, remove: 1 });
  });

  it("ignores blockers outside the list", () => {
    assert.equal(chainDepths([{ id: "a", waitingFor: [ref("elsewhere")] }]).get("a"), 0);
  });
});

describe("projectCalendarItems", () => {
  const base = { id: "p1", name: "Ski trip", color: "#3b82b6", status: "PLANNED" as const };

  it("spans the project's dates as an all-day bar", () => {
    const [item] = projectCalendarItems([{ ...base, startDate: "2027-02-13", endDate: "2027-02-20" }], "2027-02-01", "2027-02-28");
    assert.equal(item?.allDay, true);
    assert.equal(item?.start, "2027-02-13");
    assert.equal(item?.end, "2027-02-20");
    assert.equal(item?.href, "/projects/p1");
  });

  it("uses the start date alone without an end date, and leaves out cancelled projects and other months", () => {
    const items = projectCalendarItems(
      [
        { ...base, id: "a", startDate: "2027-02-13", endDate: null },
        { ...base, id: "b", startDate: "2027-02-13", endDate: "2027-02-14", status: "CANCELLED" },
        { ...base, id: "c", startDate: "2027-04-01", endDate: "2027-04-02" },
      ],
      "2027-02-01",
      "2027-02-28",
    );
    assert.deepEqual(
      items.map((item) => [item.id, item.start, item.end]),
      [["a", "2027-02-13", "2027-02-13"]],
    );
  });
});
