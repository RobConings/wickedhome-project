import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupContributionHistory } from "@/features/money/types/contribution-history";

const entry = (date: string, habitantId: string | null, amountCents: number, accountId = "joint") => ({ date, habitantId, amountCents, accountId });

describe("contribution history", () => {
  it("groups multiple payments by calendar month, person and account without merging savings", () => {
    const history = groupContributionHistory([
      entry("2025-12-31", "rob", 100_000),
      entry("2026-01-01", "rob", 100_000),
      entry("2026-01-31", "rob", 50_000),
      entry("2026-01-02", "sofie", 120_000),
      entry("2026-01-03", "rob", 20_000, "savings"),
    ], "2026-10-28");
    assert.deepEqual(history.rows, [
      { month: "2026-01", accountId: "joint", habitantId: "rob", amountCents: 150_000 },
      { month: "2026-01", accountId: "joint", habitantId: "sofie", amountCents: 120_000 },
      { month: "2026-01", accountId: "savings", habitantId: "rob", amountCents: 20_000 },
      { month: "2025-12", accountId: "joint", habitantId: "rob", amountCents: 100_000 },
    ]);
  });

  it("deducts withdrawals and shifts direct settlements between people without changing the total", () => {
    const history = groupContributionHistory([
      entry("2026-10-01", "sofie", 200_000),
      entry("2026-10-02", "sofie", -30_000),
      entry("2026-10-03", "rob", 50_000),
      entry("2026-10-03", "sofie", -50_000),
    ], "2026-10-28");
    assert.equal(history.rows.find((row) => row.habitantId === "sofie")?.amountCents, 120_000);
    assert.equal(history.rows.find((row) => row.habitantId === "rob")?.amountCents, 50_000);
    assert.equal(history.rows.reduce((sum, row) => sum + row.amountCents, 0), 170_000);
  });

  it("includes today's payments and older payments, excludes future payments and preserves former members", () => {
    const history = groupContributionHistory([
      entry("2024-01-01", null, 10_000),
      entry("2026-10-28", "rob", 30_000),
      entry("2026-10-29", "rob", 40_000),
    ], "2026-10-28");
    assert.equal(history.rows.length, 2);
    assert.equal(history.rows.reduce((sum, row) => sum + row.amountCents, 0), 40_000);
    assert.equal(history.rows[1]?.habitantId, null);
    assert.deepEqual(groupContributionHistory([], "2026-10-28"), { today: "2026-10-28", rows: [] });
  });
});
