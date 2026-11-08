import assert from "node:assert/strict";
import { it } from "node:test";
import { startOfDayIn, todayIn } from "./dates";

it("date-only receipt boundaries stay on the household day at midnight and across DST", () => {
  for (const [date, expected] of [
    ["2026-11-08", "2026-11-07T23:00:00.000Z"],
    ["2026-03-29", "2026-03-28T23:00:00.000Z"],
    ["2026-03-30", "2026-03-29T22:00:00.000Z"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z"],
    ["2026-10-26", "2026-10-25T23:00:00.000Z"],
  ]) {
    const instant = startOfDayIn(date!);
    assert.equal(instant.toISOString(), expected);
    assert.equal(todayIn(undefined, instant), date);
    assert.notEqual(todayIn(undefined, new Date(instant.getTime() - 1)), date);
  }
});
