/**
 * Unit tests for task reminders: when a reminder is due, late or skipped, its text, the form contract and
 * the quiet-hours rule. No database needed. Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/tasks/task-reminders.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reminderMoment, taskInputSchema } from "@/features/tasks/types/tasks";
import { getNotificationKind } from "../notifications/notification-kinds";
import { decideDelivery } from "../notifications/notification-policy";
import { reminderAction, reminderColumns, reminderContent, reminderInstant, TASKS_REMINDER_KIND } from "./task-reminders";
import { taskItems } from "./tasks.source";

describe("task reminders", () => {
  it("computes the wall-clock moment, also across midnight", () => {
    assert.deepEqual(reminderMoment("2026-10-04", "21:00", 0), { date: "2026-10-04", time: "21:00" });
    assert.deepEqual(reminderMoment("2026-10-04", "21:00", 15), { date: "2026-10-04", time: "20:45" });
    assert.deepEqual(reminderMoment("2026-10-05", "00:10", 30), { date: "2026-10-04", time: "23:40" });
    assert.deepEqual(reminderMoment("2026-10-05", "07:30", 1440), { date: "2026-10-04", time: "07:30" });
  });

  it("turns it into an instant in Brussels time (summer and winter)", () => {
    const at = (dueDate: string | null, dueTime: string | null, reminderMinutes: number | null, startDate: string | null = null) =>
      reminderInstant({ dueDate, dueTime, reminderMinutes, startDate })?.toISOString() ?? null;
    assert.equal(at("2026-10-04", "21:00", 0), "2026-10-04T19:00:00.000Z");
    assert.equal(at("2026-12-04", "21:00", 30), "2026-12-04T19:30:00.000Z");
    assert.equal(at("2026-10-04", "21:00", null), null);
    assert.equal(at(null, "21:00", 0), null);
  });

  it("counts all-day tasks back from 09:00 on their (first) day, timeslots from their start", () => {
    const at = (task: { dueDate: string; dueTime?: string | null; startDate?: string | null }, reminderMinutes: number) =>
      reminderInstant({ dueTime: null, ...task, reminderMinutes })?.toISOString() ?? null;
    // One day: 09:00 that day, or a day before at 09:00.
    assert.equal(at({ dueDate: "2026-10-04" }, 0), "2026-10-04T07:00:00.000Z");
    assert.equal(at({ dueDate: "2026-10-04" }, 1440), "2026-10-03T07:00:00.000Z");
    // Several days: from the first day, not the due (last) day.
    assert.equal(at({ startDate: "2026-10-12", dueDate: "2026-10-14" }, 0), "2026-10-12T07:00:00.000Z");
    // A timeslot 10:00–12:00: 30 minutes before the start.
    assert.equal(at({ dueDate: "2026-10-10", dueTime: "10:00" }, 30), "2026-10-10T07:30:00.000Z");
  });

  it("clears remindedAt only when the reminder moves", () => {
    const at = new Date("2026-10-04T19:00:00.000Z");
    const next = { dueDate: "2026-10-04", dueTime: "21:00", reminderMinutes: 0 };
    assert.deepEqual(reminderColumns(next, { remindAt: at }), { remindAt: at });
    assert.deepEqual(reminderColumns({ ...next, dueTime: "21:30" }, { remindAt: at }), {
      remindAt: new Date("2026-10-04T19:30:00.000Z"),
      remindedAt: null,
    });
    assert.deepEqual(reminderColumns({ ...next, reminderMinutes: null }, { remindAt: at }), { remindAt: null, remindedAt: null });
    assert.deepEqual(reminderColumns(next), { remindAt: at, remindedAt: null });
  });

  it("sends a reminder up to 30 minutes late, then skips it", () => {
    const at = new Date("2026-10-04T19:00:00.000Z");
    assert.equal(reminderAction(at, new Date("2026-10-04T18:59:00.000Z")), "wait");
    assert.equal(reminderAction(at, at), "send");
    assert.equal(reminderAction(at, new Date("2026-10-04T19:29:00.000Z")), "send");
    assert.equal(reminderAction(at, new Date("2026-10-04T19:31:00.000Z")), "skip");
    assert.equal(reminderAction(at, new Date("2026-10-05T06:00:00.000Z")), "skip");
  });

  it("says what and when, in the recipient's language", () => {
    const task = { title: "Vuilbak buiten zetten", dueDate: "2026-10-04", dueTime: "21:00", reminderMinutes: 0 };
    assert.deepEqual(reminderContent(task, "nl", new Date("2026-10-04T19:00:00.000Z")), {
      title: "Herinnering: Vuilbak buiten zetten",
      body: "Vandaag om 21:00",
    });
    assert.deepEqual(reminderContent({ ...task, reminderMinutes: 15 }, "en", new Date("2026-10-04T18:45:00.000Z")), {
      title: "Reminder: Vuilbak buiten zetten",
      body: "Today at 21:00 · in 15 min",
    });
    const tomorrow = reminderContent({ ...task, dueDate: "2026-10-05", dueTime: "07:30", reminderMinutes: 1440 }, "en", new Date("2026-10-04T05:30:00.000Z"));
    assert.equal(tomorrow.body, "Mon 05/10/2026 at 07:30 · in 24 h");
  });

  it("says the timeslot, the day or the days", () => {
    const now = new Date("2026-10-10T07:30:00.000Z"); // Saturday 09:30
    const base = { title: "Garage opruimen", dueDate: "2026-10-10", reminderMinutes: 30 };
    assert.equal(reminderContent({ ...base, dueTime: "10:00", endTime: "12:00" }, "nl", now).body, "Vandaag 10:00–12:00 · over 30 min");
    assert.equal(reminderContent({ ...base, dueTime: null }, "en", now).body, "Today");
    assert.equal(reminderContent({ ...base, dueDate: "2026-10-11", dueTime: null }, "en", now).body, "Sun 11/10/2026");
    assert.equal(reminderContent({ ...base, startDate: "2026-10-10", dueDate: "2026-10-12", dueTime: null }, "nl", now).body, "Vandaag t/m 12/10/2026");
    assert.equal(reminderContent({ ...base, startDate: "2026-10-12", dueDate: "2026-10-14", dueTime: null }, "en", now).body, "12/10/2026 – 14/10/2026");
  });

  it("is pushed during quiet hours and with high priority, but respects switching it off", () => {
    const kind = getNotificationKind(TASKS_REMINDER_KIND);
    assert.ok(kind);
    assert.equal(kind.priority, "high");
    const night = new Date("2026-10-04T21:30:00.000Z"); // 23:30 in Brussels
    const quietHours = { enabled: true, start: "22:00", end: "07:00" };
    assert.deepEqual(decideDelivery({ kind, role: "adult", preferences: { quietHours, kinds: {} }, now: night }), { deliver: true, push: "now" });
    const off = { quietHours, kinds: { [TASKS_REMINDER_KIND]: { enabled: false } } };
    assert.deepEqual(decideDelivery({ kind, role: "adult", preferences: off as never, now: night }), { deliver: false, reason: "disabled" });
  });

  it("validates time, timeslot, several days and reminder in the task contract", () => {
    const base = { title: "Loodgieter bellen", dueDate: "2026-10-05" };
    const error = (value: Record<string, unknown>) => taskInputSchema.safeParse(value).error?.issues[0]?.message;
    assert.equal(taskInputSchema.safeParse({ ...base, dueTime: "07:30", reminderMinutes: "15" }).data?.reminderMinutes, 15);
    assert.equal(taskInputSchema.safeParse({ ...base, dueTime: "7:30" }).success, false);
    assert.equal(error({ title: "x", dueTime: "21:00" }), "timeNeedsDate");
    // All day with a reminder (09:00) is fine; without a date it isn't.
    assert.equal(taskInputSchema.safeParse({ ...base, reminderMinutes: 0 }).success, true);
    assert.equal(error({ title: "x", reminderMinutes: 0 }), "reminderNeedsDate");
    assert.equal(taskInputSchema.safeParse({ ...base, dueTime: "10:00", endTime: "12:00" }).success, true);
    assert.equal(error({ ...base, endTime: "12:00" }), "endTimeNeedsTime");
    assert.equal(error({ ...base, dueTime: "12:00", endTime: "10:00" }), "endTimeBeforeStart");
    assert.equal(taskInputSchema.safeParse({ ...base, startDate: "2026-10-03" }).success, true);
    assert.equal(error({ ...base, startDate: "2026-10-07" }), "startDateAfterEnd");
    assert.equal(error({ title: "x", startDate: "2026-10-03" }), "startDateNeedsDate");
    assert.equal(error({ ...base, startDate: "2026-10-03", dueTime: "10:00" }), "daysAllDay");
    assert.equal(error({ ...base, startDate: "2025-01-01" }), "daysTooLong");
  });
});

describe("timed tasks in the calendar", () => {
  it("puts a task with a time at its hour, for every occurrence", () => {
    const items = taskItems(
      [
        {
          id: "t1",
          title: "Vuilbak buiten",
          dueDate: "2026-10-04",
          dueTime: "21:00",
          estimatedMinutes: null,
          reminder: true,
          rrule: "FREQ=WEEKLY;BYDAY=SU",
          recurrenceStart: "2026-10-04",
          occurrenceDate: "2026-10-04",
          assigneeIds: ["a"],
          rotateAssignees: false,
          placeName: null,
          priority: "normal",
          type: "chore",
        },
      ],
      "2026-10-01",
      "2026-10-12",
    );
    assert.deepEqual(
      items.map((item) => [item.id, item.allDay, item.start, item.end, item.meta?.reminder]),
      [
        ["t1", false, "2026-10-04T19:00:00.000Z", "2026-10-04T19:30:00.000Z", 1],
        ["t1:2026-10-11", false, "2026-10-11T19:00:00.000Z", "2026-10-11T19:30:00.000Z", 1],
      ],
    );
  });

  const source = {
    id: "t2",
    title: "Garage",
    dueDate: "2026-10-10",
    estimatedMinutes: null,
    rrule: null,
    recurrenceStart: null,
    occurrenceDate: null,
    assigneeIds: [],
    rotateAssignees: false,
    placeName: null,
    priority: "normal",
    type: "job",
  };

  it("shows a timeslot as a block from start to end, every week the same", () => {
    const items = taskItems(
      [{ ...source, dueTime: "10:00", endTime: "12:00", estimatedMinutes: 30, rrule: "FREQ=WEEKLY;BYDAY=SA", recurrenceStart: "2026-10-10", occurrenceDate: "2026-10-10" }],
      "2026-10-01",
      "2026-10-18",
    );
    assert.deepEqual(
      items.map((item) => [item.id, item.allDay, item.start, item.end]),
      [
        ["t2", false, "2026-10-10T08:00:00.000Z", "2026-10-10T10:00:00.000Z"],
        ["t2:2026-10-17", false, "2026-10-17T08:00:00.000Z", "2026-10-17T10:00:00.000Z"],
      ],
    );
  });

  it("spans several days in the all-day row, also when the range starts or ends inside it", () => {
    const task = { ...source, startDate: "2026-10-12", dueDate: "2026-10-14" };
    const span = (from: string, to: string) => taskItems([task], from, to).map((item) => [item.allDay, item.start, item.end]);
    assert.deepEqual(span("2026-10-01", "2026-10-31"), [[true, "2026-10-12", "2026-10-14"]]);
    assert.deepEqual(span("2026-10-13", "2026-10-13"), [[true, "2026-10-12", "2026-10-14"]], "a day inside the span");
    assert.deepEqual(span("2026-10-05", "2026-10-12"), [[true, "2026-10-12", "2026-10-14"]], "the range ends on the first day");
    assert.deepEqual(span("2026-10-15", "2026-10-20"), []);
    // Repeating every week: each occurrence keeps its three days.
    const weekly = taskItems([{ ...task, rrule: "FREQ=WEEKLY;BYDAY=WE", recurrenceStart: "2026-10-14", occurrenceDate: "2026-10-14" }], "2026-10-15", "2026-10-25");
    assert.deepEqual(weekly.map((item) => [item.id, item.start, item.end]), [["t2:2026-10-21", "2026-10-19", "2026-10-21"]]);
  });
});
