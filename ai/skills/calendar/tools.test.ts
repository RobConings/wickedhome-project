/**
 * The calendar skill: default end times and edits merged into the full event input. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/calendar/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/features/calendar/types/calendar";
import { listAssistantTools } from "@ai/core/tools";
import "@ai/skills";
import { mergeEventInput, plusOneHour } from "./event-input";

const event: CalendarEvent = {
  id: "e1",
  kind: "event",
  title: "Tandarts Lena",
  description: null,
  location: "Gent",
  category: "health",
  allDay: false,
  startDate: "2026-10-06",
  endDate: "2026-10-06",
  startTime: "14:00",
  endTime: "14:30",
  rrule: null,
  participantIds: ["h3"],
  shop: null,
  color: "#000",
};

describe("calendar skill", () => {
  it("defaults the end one hour after the start, within the day", () => {
    assert.equal(plusOneHour("09:15"), "10:15");
    assert.equal(plusOneHour("23:30"), "23:59");
  });

  it("moves an event and keeps its length", () => {
    const moved = mergeEventInput(event, { date: "2026-10-09", startTime: "10:00" });
    assert.equal(moved.startDate, "2026-10-09");
    assert.equal(moved.endDate, "2026-10-09");
    assert.equal(moved.startTime, "10:00");
    assert.equal(moved.endTime, "10:30");
    assert.equal(moved.location, "Gent");
    assert.deepEqual(moved.participantIds, ["h3"]);
  });

  it("keeps a multi-day event's length when only the start day changes", () => {
    const trip = mergeEventInput({ ...event, allDay: true, startTime: null, endTime: null, startDate: "2026-10-10", endDate: "2026-10-12" }, { date: "2026-10-17" });
    assert.equal(trip.allDay, true);
    assert.equal(trip.endDate, "2026-10-19");
  });

  it("makes an event all-day, or timed again, and sets a repeat", () => {
    const allDay = mergeEventInput(event, { allDay: true });
    assert.equal(allDay.allDay, true);
    assert.equal(allDay.startTime, null);
    const timed = mergeEventInput({ ...event, allDay: true, startTime: null, endTime: null }, { startTime: "18:00" });
    assert.equal(timed.allDay, false);
    assert.equal(timed.endTime, "19:00");
    assert.equal(mergeEventInput(event, { repeat: "weekly" }).rrule, "FREQ=WEEKLY;BYDAY=TU");
  });

  it("asks before every change and always before a delete", () => {
    const tools = listAssistantTools().filter((tool) => tool.skill === "calendar");
    for (const tool of tools.filter((entry) => entry.permission !== "read")) assert.equal(tool.confirm, "always", tool.name);
    assert.equal(tools.find((tool) => tool.name === "calendar.delete_event")?.permission, "sensitive");
    assert.ok(tools.filter((tool) => tool.permission !== "read").every((tool) => !tool.roles.includes("child")));
  });
});
