/**
 * Unit tests for laying out multi-day entries as bars (month rows, the week's all-day row) and for the
 * agenda showing them once. Run on the server:
 *
 *   npx tsx --test src/features/calendar/components/calendar-layout.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesCategoryFilter, parseCategoryFilter, type CalendarEntry } from "../types/calendar";
import { datesInRange } from "../types/calendar-time";
import { groupEntriesForAgenda, isMultiDay } from "./calendar-format";
import { layoutSpans } from "./calendar-layout";

const allDay = (key: string, start: string, end: string): CalendarEntry => ({
  key,
  source: "events",
  kind: "event",
  category: null,
  title: key,
  allDay: true,
  start,
  end,
  color: "#124734",
  participantIds: [],
  location: null,
  readOnly: false,
  eventId: key,
  recurring: false,
  shop: null,
  href: null,
  meta: null,
});

const timed = (key: string, start: string, end: string): CalendarEntry => ({ ...allDay(key, start, end), allDay: false });

// Monday 26 October – Sunday 1 November 2026.
const week = datesInRange({ from: "2026-10-26", to: "2026-11-01" });

describe("multi-day entries", () => {
  it("are all-day entries over several days, or timed ones of 24 hours or more", () => {
    assert.equal(isMultiDay(allDay("a", "2026-10-26", "2026-10-26")), false);
    assert.equal(isMultiDay(allDay("a", "2026-10-26", "2026-10-27")), true);
    assert.equal(isMultiDay(timed("t", "2026-10-26T21:00:00.000Z", "2026-10-27T01:00:00.000Z")), false);
    assert.equal(isMultiDay(timed("t", "2026-10-07T05:00:00.000Z", "2026-10-09T17:00:00.000Z")), true);
  });

  it("become one segment per week row, clipped and flagged where they continue", () => {
    const { segments, lanes } = layoutSpans([allDay("ardennes", "2026-10-24", "2026-10-31")], week);
    assert.equal(lanes, 1);
    assert.deepEqual(
      segments.map(({ startColumn, endColumn, continuesBefore, continuesAfter }) => ({ startColumn, endColumn, continuesBefore, continuesAfter })),
      [{ startColumn: 0, endColumn: 5, continuesBefore: true, continuesAfter: false }],
    );
  });

  it("stack in lanes when they overlap and reuse a lane when they don't", () => {
    const { segments, lanes } = layoutSpans(
      [
        allDay("break", "2026-10-26", "2026-11-01"),
        allDay("ardennes", "2026-10-24", "2026-10-31"),
        allDay("oma", "2026-10-27", "2026-10-28"),
        allDay("short", "2026-10-26", "2026-10-26"),
        allDay("later", "2026-10-30", "2026-10-31"),
      ],
      week,
    );
    const lane = (key: string) => segments.find((segment) => segment.entry.key === key)?.lane;
    assert.equal(lanes, 3);
    assert.equal(lane("break"), 0);
    assert.equal(lane("ardennes"), 1);
    assert.equal(lane("oma"), 2);
    assert.equal(lane("later"), 2);
    assert.equal(lane("short"), undefined, "single-day entries are not bars");
  });

  it("show once in the agenda, on their first visible day", () => {
    const byDate = groupEntriesForAgenda(
      [allDay("ardennes", "2026-10-24", "2026-10-31"), allDay("plopsaland", "2026-10-25", "2026-10-25")],
      { from: "2026-10-26", to: "2026-10-31" },
    );
    assert.deepEqual([...byDate.entries()].map(([date, entries]) => [date, entries.map((entry) => entry.key)]), [["2026-10-26", ["ardennes"]]]);
  });
});

describe("category filter", () => {
  it("reads the URL value and keeps matching events; uncategorised events count as other", () => {
    assert.deepEqual(parseCategoryFilter("sport,holiday,bogus"), ["holiday", "sport"]);
    assert.deepEqual(parseCategoryFilter(null), []);
    const holiday = { ...allDay("h", "2026-10-24", "2026-10-31"), category: "holiday" as const };
    const plain = allDay("p", "2026-10-24", "2026-10-24");
    const birthday = { ...plain, source: "birthdays", kind: "birthday" as const, eventId: null };
    assert.equal(matchesCategoryFilter(holiday, ["holiday"]), true);
    assert.equal(matchesCategoryFilter(plain, ["holiday"]), false);
    assert.equal(matchesCategoryFilter(plain, ["other"]), true);
    assert.equal(matchesCategoryFilter(birthday, ["other"]), false);
    assert.equal(matchesCategoryFilter(birthday, []), true);
  });
});
