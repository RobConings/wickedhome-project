/**
 * Unit tests for recurrence expansion, time-zone handling, calendar sources and the event-changed hook. No
 * database needed (the Prisma client is created but never connects). Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/calendar/calendar.test.ts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { CALENDAR_RRULE_SUPPORT, type CalendarEvent, type CalendarEventInput } from "@/features/calendar/types/calendar";
import { eventEntries } from "@/features/calendar/types/calendar-occurrences";
import { monthGridRange, weekRange, zonedParts, zonedToUtc } from "@/features/calendar/types/calendar-time";
import { expandRRule, formatRRule, parseRRule, type RRule } from "@/types/recurrence";
import { db } from "../lib/db";
import { birthdayInYear, birthdayItems } from "./birthdays.source";
import { onCalendarEventChanged, type CalendarEventChangedEvent } from "./calendar-events";
import { createEvent, deleteEvent, updateEvent } from "./calendar.service";

/** The calendar's subset of the shared recurrence module. */
const parseCalendarRRule = (text: string) => parseRRule(text, CALENDAR_RRULE_SUPPORT);

const rule = (text: string): RRule => {
  const parsed = parseCalendarRRule(text);
  assert.ok(parsed, `expected ${text} to parse`);
  return parsed;
};

describe("parseCalendarRRule", () => {
  it("parses the supported subset", () => {
    assert.deepEqual(rule("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=10"), {
      freq: "WEEKLY",
      interval: 2,
      count: 10,
      byDay: ["MO", "WE"],
    });
    assert.deepEqual(rule("FREQ=MONTHLY;UNTIL=20261231T225959Z"), { freq: "MONTHLY", interval: 1, until: "2026-12-31" });
    assert.deepEqual(rule("freq=daily;wkst=MO"), { freq: "DAILY", interval: 1 });
  });

  it("rejects what it can't expand", () => {
    for (const text of [
      "",
      "FREQ=HOURLY",
      "FREQ=MONTHLY;BYDAY=MO",
      "FREQ=WEEKLY;BYDAY=2MO",
      "FREQ=WEEKLY;BYDAY=MO,MO",
      "FREQ=DAILY;COUNT=3;UNTIL=20260101",
      "FREQ=DAILY;INTERVAL=0",
      "FREQ=DAILY;UNTIL=20260231",
      "FREQ=MONTHLY;BYMONTHDAY=1",
      "FREQ=WEEKLY;WKST=SU",
      "FREQ=DAILY;FREQ=WEEKLY",
      "FREQ=YEARLY;BYMONTH=3,4,5;BYMONTHDAY=1;BYSETPOS=1",
    ]) {
      assert.equal(parseCalendarRRule(text), null, text);
    }
  });

  it("formats canonically and round-trips", () => {
    const text = formatRRule({ freq: "WEEKLY", interval: 1, byDay: ["FR", "MO"], until: "2027-06-30" });
    assert.equal(text, "FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20270630");
    assert.equal(formatRRule(rule(text)), text);
  });
});

describe("expandRRule", () => {
  it("DAILY with INTERVAL and COUNT", () => {
    assert.deepEqual(expandRRule(rule("FREQ=DAILY;INTERVAL=2;COUNT=4"), "2026-10-01", { to: "2026-12-31" }), [
      "2026-10-01",
      "2026-10-03",
      "2026-10-05",
      "2026-10-07",
    ]);
  });

  it("COUNT counts from DTSTART, also before the requested range", () => {
    assert.deepEqual(
      expandRRule(rule("FREQ=DAILY;COUNT=5"), "2026-10-01", { from: "2026-10-04", to: "2026-10-31" }),
      ["2026-10-04", "2026-10-05"],
    );
  });

  it("WEEKLY on school days, skipping days before DTSTART", () => {
    // 2026-10-07 is a Wednesday.
    assert.deepEqual(
      expandRRule(rule("FREQ=WEEKLY;BYDAY=MO,TU,TH,FR"), "2026-10-07", { to: "2026-10-13" }),
      ["2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"],
    );
  });

  it("WEEKLY without BYDAY uses DTSTART's weekday; INTERVAL=2 skips weeks", () => {
    assert.deepEqual(
      expandRRule(rule("FREQ=WEEKLY;INTERVAL=2"), "2026-10-03", { from: "2026-10-10", to: "2026-11-15" }),
      ["2026-10-17", "2026-10-31", "2026-11-14"],
    );
  });

  it("WEEKLY with UNTIL is inclusive", () => {
    assert.deepEqual(
      expandRRule(rule("FREQ=WEEKLY;UNTIL=20261017"), "2026-10-03", { to: "2026-12-31" }),
      ["2026-10-03", "2026-10-10", "2026-10-17"],
    );
  });

  it("MONTHLY skips months without the day", () => {
    assert.deepEqual(expandRRule(rule("FREQ=MONTHLY"), "2026-01-31", { to: "2026-06-30" }), [
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
  });

  it("MONTHLY with INTERVAL and COUNT ignores skipped months in the count", () => {
    assert.deepEqual(expandRRule(rule("FREQ=MONTHLY;INTERVAL=3;COUNT=3"), "2026-10-15", { to: "2030-01-01" }), [
      "2026-10-15",
      "2027-01-15",
      "2027-04-15",
    ]);
  });

  it("YEARLY on 29 February only in leap years", () => {
    assert.deepEqual(expandRRule(rule("FREQ=YEARLY"), "2024-02-29", { to: "2032-12-31" }), [
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
  });

  it("skips ahead quickly for long-running rules without COUNT", () => {
    const dates = expandRRule(rule("FREQ=DAILY"), "2000-01-01", { from: "2026-10-01", to: "2026-10-03" });
    assert.deepEqual(dates, ["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("respects the limit", () => {
    assert.equal(expandRRule(rule("FREQ=DAILY"), "2026-01-01", { to: "2026-12-31", limit: 10 }).length, 10);
  });
});

describe("time zone", () => {
  it("converts Brussels wall-clock time to UTC across DST", () => {
    assert.equal(zonedToUtc("2026-07-01", "08:30").toISOString(), "2026-07-01T06:30:00.000Z");
    assert.equal(zonedToUtc("2026-12-01", "08:30").toISOString(), "2026-12-01T07:30:00.000Z");
    // The hour skipped when summer time starts moves forward.
    assert.equal(zonedToUtc("2026-03-29", "02:30").toISOString(), "2026-03-29T01:30:00.000Z");
  });

  it("reads UTC instants as Brussels wall-clock time", () => {
    assert.deepEqual(zonedParts("2026-10-24T22:30:00.000Z"), { date: "2026-10-25", time: "00:30", minutes: 30 });
    assert.deepEqual(zonedParts("2026-10-25T22:30:00.000Z"), { date: "2026-10-25", time: "23:30", minutes: 1410 });
  });

  it("builds Monday-first grids", () => {
    assert.deepEqual(weekRange("2026-10-02"), { from: "2026-09-28", to: "2026-10-04" });
    assert.deepEqual(monthGridRange("2026-10-15"), { from: "2026-09-28", to: "2026-11-01" });
  });
});

describe("eventEntries", () => {
  const base: CalendarEvent = {
    id: "e1",
    kind: "event",
    title: "School drop-off",
    description: null,
    location: null,
    category: "school",
    allDay: false,
    startDate: "2026-10-05",
    endDate: "2026-10-05",
    startTime: "08:15",
    endTime: "08:45",
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR",
    participantIds: ["h3"],
    shop: null,
    color: "#d9912b",
  };

  it("expands a recurring timed event, keeping local time across the DST change", () => {
    const entries = eventEntries(base, { from: "2026-10-23", to: "2026-10-27" });
    assert.deepEqual(
      entries.map((entry) => [entry.key, entry.start]),
      [
        ["event:e1:2026-10-23", "2026-10-23T06:15:00.000Z"],
        ["event:e1:2026-10-26", "2026-10-26T07:15:00.000Z"],
        ["event:e1:2026-10-27", "2026-10-27T07:15:00.000Z"],
      ],
    );
  });

  it("includes a multi-day all-day event that started before the range", () => {
    const camp = { ...base, allDay: true, startTime: null, endTime: null, rrule: null, startDate: "2026-10-28", endDate: "2026-11-02" };
    const [entry, ...rest] = eventEntries(camp, { from: "2026-11-01", to: "2026-11-30" });
    assert.equal(rest.length, 0);
    assert.deepEqual([entry?.start, entry?.end, entry?.key], ["2026-10-28", "2026-11-02", "event:e1"]);
  });

  it("leaves out a timed event that ends exactly at the start of the range", () => {
    const late = { ...base, rrule: null, startDate: "2026-10-31", endDate: "2026-11-01", startTime: "22:00", endTime: "00:00" };
    assert.equal(eventEntries(late, { from: "2026-11-01", to: "2026-11-30" }).length, 0);
  });
});

describe("birthdays source", () => {
  it("handles 29 February", () => {
    assert.equal(birthdayInYear("2016-02-29", 2027), "2027-02-28");
    assert.equal(birthdayInYear("2016-02-29", 2028), "2028-02-29");
  });

  it("lists birthdays in range with the age turned", () => {
    const items = birthdayItems(
      [
        { id: "h3", name: "Lena", color: "#d9912b", birthday: "2016-03-21" },
        { id: "h2", name: "Sofie", color: "#c2508a", birthday: "1988-10-14" },
      ],
      "2026-09-28",
      "2026-11-01",
    );
    assert.deepEqual(items, [
      {
        id: "h2:2026",
        kind: "birthday",
        title: "Sofie",
        allDay: true,
        start: "2026-10-14",
        color: "#c2508a",
        participantIds: ["h2"],
        href: "/habitants",
        meta: { age: 38 },
      },
    ]);
  });

  it("spans a year boundary and skips years before birth", () => {
    const items = birthdayItems([{ id: "b", name: "Baby", color: "#000000", birthday: "2026-12-30" }], "2026-12-01", "2027-01-31");
    assert.deepEqual(items, []);
    const next = birthdayItems([{ id: "b", name: "Baby", color: "#000000", birthday: "2025-12-30" }], "2026-12-01", "2027-01-31");
    assert.deepEqual(next.map((item) => [item.start, item.meta]), [["2026-12-30", { age: 1 }]]);
  });
});

describe("event-changed hook (onCalendarEventChanged)", () => {
  // The Prisma delegate is swapped for an in-memory fake, so the real service code runs without a database.
  const client = db as unknown as Record<string, unknown>;
  const original = client.calendarEvent;
  const rows = new Map<string, Record<string, unknown>>();
  let nextId = 0;
  let failWrites = false;
  const toRow = (id: string, data: Record<string, unknown>) => {
    const fields = { ...data };
    delete fields.participants;
    return { ...fields, id, participants: [], shop: null };
  };
  const changes: CalendarEventChangedEvent[] = [];
  let stop: () => void = () => undefined;

  before(() => {
    client.calendarEvent = {
      findFirst: async ({ where }: { where: { id: string; householdId: string } }) => {
        const row = rows.get(where.id);
        return row && row.householdId === where.householdId ? row : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failWrites) throw new Error("database down");
        const row = toRow(`e${++nextId}`, data);
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...rows.get(where.id), ...toRow(where.id, data) };
        rows.set(where.id, row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        rows.delete(where.id);
        return row;
      },
    };
    stop = onCalendarEventChanged((event) => {
      changes.push(event);
    });
  });
  after(() => {
    client.calendarEvent = original;
    stop();
  });

  const input = (overrides: Partial<CalendarEventInput> = {}): CalendarEventInput => ({
    kind: "event",
    title: "Dentist",
    category: "health",
    allDay: true,
    startDate: "2026-10-20",
    endDate: "2026-10-20",
    participantIds: [],
    ...overrides,
  });

  it("fires created, updated and deleted after the write, with household and event id", async () => {
    changes.length = 0;
    const event = await createEvent("h1", input());
    await updateEvent("h1", event.id, input({ title: "Dentist (moved)", category: "school" }));
    await deleteEvent("h1", event.id);
    assert.deepEqual(changes, [
      { householdId: "h1", eventId: event.id, change: "created" },
      { householdId: "h1", eventId: event.id, change: "updated" },
      { householdId: "h1", eventId: event.id, change: "deleted" },
    ]);
  });

  it("fires once per edit of a recurring series (the series is one event)", async () => {
    changes.length = 0;
    const series = await createEvent("h1", input({ title: "Swimming", rrule: "FREQ=WEEKLY;BYDAY=WE" }));
    await updateEvent("h1", series.id, input({ title: "Swimming", rrule: "FREQ=WEEKLY;BYDAY=TH" }));
    await deleteEvent("h1", series.id);
    assert.deepEqual(
      changes.map((change) => [change.eventId, change.change]),
      [
        [series.id, "created"],
        [series.id, "updated"],
        [series.id, "deleted"],
      ],
    );
  });

  it("doesn't fire when the write fails or the event belongs to another household", async () => {
    changes.length = 0;
    failWrites = true;
    await assert.rejects(createEvent("h1", input()));
    failWrites = false;
    const event = await createEvent("h1", input());
    changes.length = 0;
    await assert.rejects(updateEvent("h2", event.id, input()));
    await assert.rejects(deleteEvent("h2", event.id));
    assert.deepEqual(changes, []);
  });

  it("logs a listener that throws and still saves", async (t) => {
    const logged = t.mock.method(console, "error", () => undefined);
    const stopBroken = onCalendarEventChanged(() => {
      throw new Error("listener broke");
    });
    try {
      const event = await createEvent("h1", input({ title: "Still saved" }));
      assert.equal(event.title, "Still saved");
      assert.equal(logged.mock.callCount(), 1);
    } finally {
      stopBroken();
    }
  });
});
