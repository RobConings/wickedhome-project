/**
 * Unit tests for grouping collections into days and calendar items. No database calls.
 * Run: npx tsx --test src/api/waste/waste.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupWasteDays, wasteCalendarItems } from "./waste.service";

const row = (date: string, fraction: "PMD" | "PAPER" | "RESIDUAL", label: string, color: string | null = null) => ({
  date: new Date(`${date}T00:00:00Z`),
  fraction,
  label,
  color,
  note: null,
});

describe("waste days", () => {
  const days = groupWasteDays([
    row("2026-10-06", "PAPER", "Papier & karton"),
    row("2026-10-05", "RESIDUAL", "Restafval", "#767676"),
    row("2026-10-06", "PMD", "Pmd"),
  ]);

  it("groups per day, sorted, fractions in a fixed order, default colours filled in", () => {
    assert.deepEqual(days, [
      { date: "2026-10-05", collections: [{ fraction: "residual", label: "Restafval", color: "#767676", note: null }] },
      {
        date: "2026-10-06",
        collections: [
          { fraction: "pmd", label: "Pmd", color: "#3b82b6", note: null },
          { fraction: "paper", label: "Papier & karton", color: "#d9912b", note: null },
        ],
      },
    ]);
  });

  it("becomes one read-only all-day calendar item per day", () => {
    const items = wasteCalendarItems(days);
    assert.equal(items.length, 2);
    assert.deepEqual(items[1], {
      id: "2026-10-06",
      kind: "waste",
      title: "Pmd + Papier & karton",
      allDay: true,
      start: "2026-10-06",
      color: null,
      href: "/settings#waste",
      meta: { fractions: "pmd,paper" },
    });
    // A single fraction keeps its own colour.
    assert.equal(items[0]?.color, "#767676");
  });
});
