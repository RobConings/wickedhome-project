/** Unit tests for putting cron expressions in words. Run: npx tsx --test src/features/automations/types/schedule-description.test.ts */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeSchedule } from "./schedule-description";

describe("describeSchedule", () => {
  it("recognises the common shapes", () => {
    assert.deepEqual(describeSchedule("15 5 * * *"), { kind: "daily", times: ["05:15"] });
    assert.deepEqual(describeSchedule("0 6,18 * * *"), { kind: "daily", times: ["06:00", "18:00"] });
    assert.deepEqual(describeSchedule("0 7 * * 1-5"), { kind: "weekdays", times: ["07:00"] });
    assert.deepEqual(describeSchedule("30 8 * * 0,6"), { kind: "weekly", days: [6, 0], times: ["08:30"] });
    assert.deepEqual(describeSchedule("0 7 * * 1"), { kind: "weekly", days: [1], times: ["07:00"] });
    assert.deepEqual(describeSchedule("0 7 * * 0-6"), { kind: "daily", times: ["07:00"] });
    assert.deepEqual(describeSchedule("0 6 1 * *"), { kind: "monthly", day: 1, times: ["06:00"] });
    assert.deepEqual(describeSchedule("*/15 * * * *"), { kind: "everyMinutes", interval: 15 });
    assert.deepEqual(describeSchedule("* * * * *"), { kind: "everyMinutes", interval: 1 });
    assert.deepEqual(describeSchedule("5 * * * *"), { kind: "hourly", minute: 5 });
    assert.deepEqual(describeSchedule("10 */6 * * *"), { kind: "everyHours", interval: 6, minute: 10 });
  });

  it("treats 7 as Sunday", () => {
    assert.deepEqual(describeSchedule("0 9 * * 7"), { kind: "weekly", days: [0], times: ["09:00"] });
  });

  it("falls back to the expression for anything else", () => {
    for (const expression of ["0 6 1 1 *", "0 6 1-7 * 1", "*/5 9-17 * * 1-5", "0 */2,5 * * *", "0 6 * * MON", "0 0-23 * * *", "nonsense"]) {
      assert.deepEqual(describeSchedule(expression), { kind: "custom", expression }, expression);
    }
  });
});
