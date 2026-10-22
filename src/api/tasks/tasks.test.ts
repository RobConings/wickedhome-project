/**
 * Unit tests for the shared recurrence module and task scheduling. No database needed (the Prisma client
 * is created but never connects). Run on the server:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test src/api/tasks/tasks.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presetRRule, repeatPresetOf } from "@/features/tasks/types/task-repeat";
import {
  applyTaskFilters,
  completedTodayEntries,
  dayGroupOf,
  groupByDay,
  groupByPlace,
  groupByType,
  parseTaskFilters,
  snoozeDate,
  taskFiltersToParams,
  todayProgress,
} from "@/features/tasks/types/task-views";
import { switchWhenKind, whenColumns, whenValueOf, withStartDate, withStartTime } from "@/features/tasks/types/task-when";
import {
  firstDueDate,
  isWaiting,
  movedStartDate,
  nextDueDate,
  rotateAssignees,
  taskReadiness,
  taskReminderMoment,
  taskWhenKind,
  wouldCreateCycle,
  type Task,
} from "@/features/tasks/types/tasks";
import {
  expandRRule,
  formatRRule,
  monthWindowOrder,
  nextOccurrence,
  parseRRule,
  seasonOf,
  seasonRRule,
  type RRule,
} from "@/types/recurrence";
import { linkedTaskChanges } from "./linked-tasks";
import { payTaskAssignees, payTaskTitle, planPayTasks } from "./pay-tasks";
import { taskItems } from "./tasks.source";

const rule = (text: string): RRule => {
  const parsed = parseRRule(text);
  assert.ok(parsed, `should parse ${text}`);
  return parsed;
};

describe("shared recurrence", () => {
  it("parses and formats the calendar subset canonically", () => {
    assert.equal(formatRRule(rule("RRULE:freq=weekly;byday=we,mo;interval=2")), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    assert.equal(formatRRule(rule("FREQ=MONTHLY;COUNT=3")), "FREQ=MONTHLY;COUNT=3");
    assert.equal(parseRRule("FREQ=MONTHLY;COUNT=3;UNTIL=20270101"), null);
    assert.equal(parseRRule("FREQ=DAILY;BYDAY=MO"), null);
    assert.equal(parseRRule("FREQ=WEEKLY;BYDAY=2MO"), null);
    assert.equal(parseRRule("FREQ=HOURLY"), null);
  });

  it("respects what a feature supports", () => {
    assert.equal(parseRRule("FREQ=DAILY", { frequencies: ["WEEKLY", "MONTHLY", "YEARLY"] }), null);
    assert.equal(parseRRule("FREQ=WEEKLY;BYDAY=MO", { byDay: false }), null);
    assert.equal(parseRRule("FREQ=MONTHLY;COUNT=2", { end: false }), null);
  });

  it("expands weekly rules on chosen weekdays", () => {
    // 2026-10-01 is a Thursday.
    assert.deepEqual(expandRRule(rule("FREQ=WEEKLY;BYDAY=MO,TH"), "2026-10-01", { to: "2026-10-12" }), [
      "2026-10-01",
      "2026-10-05",
      "2026-10-08",
      "2026-10-12",
    ]);
  });

  it("skips or clamps missing month days", () => {
    const monthly = rule("FREQ=MONTHLY");
    assert.deepEqual(expandRRule(monthly, "2026-01-31", { to: "2026-04-30" }), ["2026-01-31", "2026-03-31"]);
    assert.deepEqual(expandRRule(monthly, "2026-01-31", { to: "2026-04-30", monthEnd: "clamp" }), [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("handles seasonal windows as RFC BYMONTH + BYSETPOS", () => {
    const spring = seasonRRule("spring");
    assert.equal(formatRRule(spring), "FREQ=YEARLY;BYMONTH=3,4,5;BYMONTHDAY=1;BYSETPOS=1");
    assert.equal(seasonOf(rule(formatRRule(spring))), "spring");
    assert.deepEqual(expandRRule(spring, "2026-03-01", { to: "2028-12-31" }), ["2026-03-01", "2027-03-01", "2028-03-01"]);

    const winter = rule(formatRRule(seasonRRule("winter", { interval: 2 })));
    assert.equal(formatRRule(winter), "FREQ=YEARLY;INTERVAL=2;BYMONTH=1,2,12;BYMONTHDAY=1;BYSETPOS=-1");
    assert.deepEqual(winter.byMonth, [12, 1, 2]);
    assert.deepEqual(expandRRule(winter, "2026-12-01", { to: "2030-12-31" }), ["2026-12-01", "2028-12-01", "2030-12-01"]);

    // A wrapping window needs BYSETPOS=-1, a plain one BYSETPOS=1; gaps are rejected.
    assert.equal(parseRRule("FREQ=YEARLY;BYMONTH=1,2,12;BYSETPOS=1"), null);
    assert.equal(parseRRule("FREQ=YEARLY;BYMONTH=3,5;BYSETPOS=1"), null);
    assert.equal(parseRRule("FREQ=MONTHLY;BYMONTH=3"), null);
    assert.deepEqual(monthWindowOrder([2, 12, 1]), [12, 1, 2]);
  });

  it("finds the next occurrence, also with COUNT", () => {
    assert.equal(nextOccurrence(rule("FREQ=YEARLY"), "2020-05-14", "2026-10-02"), "2027-05-14");
    assert.equal(nextOccurrence(rule("FREQ=WEEKLY;COUNT=3"), "2026-10-01", "2026-10-16"), null);
  });
});

const baseTask: Task = {
  id: "t1",
  title: "Weekly vacuum",
  notes: null,
  type: "chore",
  place: null,
  assigneeIds: ["a", "b", "c"],
  rotateAssignees: true,
  priority: "normal",
  estimatedMinutes: null,
  status: "open",
  dueDate: "2026-10-03",
  rrule: "FREQ=WEEKLY;BYDAY=SA",
  recurrenceStart: "2026-01-03",
  checklist: [],
  materials: null,
  readiness: "ready",
  closedAt: null,
  dueTime: null,
  endTime: null,
  startDate: null,
  reminderMinutes: null,
  remindAt: null,
  remindedAt: null,
  origin: null,
  hold: null,
  waitingFor: [],
  commentCount: 0,
  project: null,
};

describe("a task's when", () => {
  it("tells the kinds apart", () => {
    assert.equal(taskWhenKind({ dueDate: null }), "none");
    assert.equal(taskWhenKind({ dueDate: "2026-10-04" }), "day");
    assert.equal(taskWhenKind({ dueDate: "2026-10-04", dueTime: "18:00" }), "moment");
    assert.equal(taskWhenKind({ dueDate: "2026-10-10", dueTime: "10:00", endTime: "12:00" }), "slot");
    assert.equal(taskWhenKind({ dueDate: "2026-10-14", startDate: "2026-10-12" }), "days");
    assert.equal(taskWhenKind({ dueDate: "2026-10-14", startDate: "2026-10-14" }), "day", "the same first and last day is one day");
  });

  it("keeps the number of days when the due date moves (snooze, next time)", () => {
    assert.equal(movedStartDate({ dueDate: "2026-10-14", startDate: "2026-10-12" }, "2026-10-21"), "2026-10-19");
    assert.equal(movedStartDate({ dueDate: "2026-10-14" }, "2026-10-21"), null);
  });

  it("starts a weekly task on its first weekday on or after the chosen date", () => {
    // Thursday 01/10/2026 → "every Sunday" starts Sunday 04/10; a date that matches stays.
    assert.equal(firstDueDate("FREQ=WEEKLY;BYDAY=SU", "2026-10-01"), "2026-10-04");
    assert.equal(firstDueDate("FREQ=WEEKLY;BYDAY=SU", "2026-10-04"), "2026-10-04");
    assert.equal(firstDueDate("FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-02"), "2026-10-05");
    assert.equal(firstDueDate("FREQ=MONTHLY", "2026-10-02"), "2026-10-02");
    assert.equal(firstDueDate(null, "2026-10-02"), "2026-10-02");
  });

  it("every Sunday at 18:00 comes back on Sunday at 18:00, with its reminder", () => {
    const sunday = { ...baseTask, dueDate: "2026-10-04", dueTime: "18:00", reminderMinutes: 0, rrule: "FREQ=WEEKLY;BYDAY=SU", recurrenceStart: "2026-10-04" };
    const next = nextDueDate({ ...sunday, occurrenceDate: "2026-10-04" }, "2026-10-04");
    assert.equal(next, "2026-10-11");
    assert.deepEqual(taskReminderMoment({ ...sunday, dueDate: next }), { date: "2026-10-11", time: "18:00" });
  });

  it("maps the form's When control to the columns and back", () => {
    const slot = whenValueOf({ dueDate: "2026-10-10", dueTime: "10:00", endTime: "12:00" });
    assert.equal(slot.kind, "slot");
    assert.deepEqual(whenColumns(slot), { dueDate: "2026-10-10", dueTime: "10:00", endTime: "12:00", startDate: "" });
    // Switching kinds keeps what fits and posts only what belongs to the kind.
    assert.deepEqual(whenColumns(switchWhenKind(slot, "day", "2026-10-02")), { dueDate: "2026-10-10", dueTime: "", endTime: "", startDate: "" });
    const days = switchWhenKind(slot, "days", "2026-10-02");
    assert.deepEqual(whenColumns(days), { dueDate: "2026-10-11", dueTime: "", endTime: "", startDate: "2026-10-10" });
    assert.equal(switchWhenKind(days, "moment", "2026-10-02").date, "2026-10-10", "back to one day: the first day");
    assert.equal(switchWhenKind(whenValueOf({}), "day", "2026-10-02").date, "2026-10-02", "a date is filled in");
    // A start time after the end moves the end an hour later; a first day after the last moves the last day.
    assert.equal(withStartTime(slot, "12:30").endTime, "13:30");
    assert.equal(withStartDate(days, "2026-10-15").date, "2026-10-16");
  });
});

describe("task scheduling", () => {
  it("moves to the occurrence after the current one when done early or on time", () => {
    assert.equal(nextDueDate({ ...baseTask, occurrenceDate: "2026-10-03" }, "2026-10-02"), "2026-10-10");
    assert.equal(nextDueDate({ ...baseTask, occurrenceDate: "2026-10-03" }, "2026-10-03"), "2026-10-10");
  });

  it("doesn't create a backlog when done late", () => {
    assert.equal(nextDueDate({ ...baseTask, occurrenceDate: "2026-09-12" }, "2026-10-01"), "2026-10-03");
  });

  it("closes one-off tasks and ended series", () => {
    assert.equal(nextDueDate({ rrule: null, recurrenceStart: null, occurrenceDate: null }, "2026-10-02"), null);
    assert.equal(
      nextDueDate({ rrule: "FREQ=WEEKLY;COUNT=2", recurrenceStart: "2026-09-26", occurrenceDate: "2026-10-03" }, "2026-10-03"),
      null,
    );
  });

  it("rotates and derives readiness", () => {
    assert.deepEqual(rotateAssignees(["a", "b", "c"]), ["b", "c", "a"]);
    assert.equal(taskReadiness({ status: "open", materials: null }), "ready");
    assert.equal(taskReadiness({ status: "open", materials: { total: 2, bought: 1 } }), "waiting");
    assert.equal(taskReadiness({ status: "open", materials: { total: 2, bought: 2 } }), "ready");
    assert.equal(taskReadiness({ status: "done", materials: { total: 2, bought: 0 } }), "done");
  });

  it("snoozes to the next Saturday for the weekend", () => {
    assert.equal(snoozeDate("weekend", "2026-10-02"), "2026-10-03"); // Friday → Saturday
    assert.equal(snoozeDate("weekend", "2026-10-03"), "2026-10-10"); // Saturday → next Saturday
  });
});

describe("task views", () => {
  const place = (id: string, floorId: string, kind: "room" | "zone", level: number) => ({
    id,
    name: id,
    kind,
    color: "#000000",
    icon: null,
    floorId,
    floorName: floorId,
    floorLevel: level,
  });
  const tasks: Task[] = [
    { ...baseTask, id: "in", place: place("Living", "ground", "room", 0) },
    { ...baseTask, id: "out", place: place("Garden", "outside", "zone", 0), rotateAssignees: false, assigneeIds: ["b"] },
    { ...baseTask, id: "up", place: place("Bedroom", "first", "room", 1) },
    { ...baseTask, id: "none" },
  ];

  it("round-trips filters through the URL, leaving out defaults", () => {
    const filters = parseTaskFilters(new URLSearchParams("view=ready&location=outside"), "a");
    assert.equal(filters.view, "ready");
    assert.equal(filters.location, "outside");
    assert.equal(taskFiltersToParams(filters, "a").toString(), "view=ready&location=outside");
    assert.equal(parseTaskFilters(new URLSearchParams(""), null).view, "all");
  });

  it("filters mine by whose turn it is, and inside/outside by place", () => {
    const context = { today: "2026-10-02", currentHabitantId: "b" };
    const mine = applyTaskFilters(tasks, { view: "mine", assignee: null, type: null, location: null, place: null, group: "due" }, context);
    assert.deepEqual(mine.map((task) => task.id), ["out"]);
    const outside = applyTaskFilters(tasks, { view: "all", assignee: null, type: null, location: "outside", place: null, group: "due" }, context);
    assert.deepEqual(outside.map((task) => task.id), ["out"]);
  });

  it("filters and groups by type, independent of the place", () => {
    const context = { today: "2026-10-02", currentHabitantId: null };
    const typed = tasks.map((task, index) => ({ ...task, type: index % 2 ? ("errand" as const) : ("job" as const) }));
    const errands = applyTaskFilters(typed, { view: "all", assignee: null, type: "errand", location: null, place: null, group: "type" }, context);
    assert.deepEqual(errands.map((task) => task.id).sort(), ["none", "out"]);
    assert.deepEqual(groupByType(typed).map((group) => group.type), ["job", "errand"]);
    assert.equal(parseTaskFilters(new URLSearchParams("type=job&group=type"), null).type, "job");
    assert.equal(parseTaskFilters(new URLSearchParams("type=bogus"), null).type, null);
  });

  it("groups by floor from the bottom up, outside last", () => {
    const { floors, unplaced } = groupByPlace(tasks);
    assert.deepEqual(floors.map((floor) => floor.floorId), ["ground", "first", "outside"]);
    assert.deepEqual(unplaced.map((task) => task.id), ["none"]);
  });
});

describe("tasks calendar source", () => {
  it("shows the due date and the coming turns of a rotating task", () => {
    const items = taskItems(
      [
        {
          id: "t1",
          title: "Weekly vacuum",
          dueDate: "2026-10-03",
          rrule: "FREQ=WEEKLY;BYDAY=SA",
          recurrenceStart: "2026-01-03",
          occurrenceDate: "2026-10-03",
          assigneeIds: ["a", "b", "c"],
          rotateAssignees: true,
          placeName: "Living room",
          priority: "normal",
          type: "chore",
        },
      ],
      "2026-10-01",
      "2026-10-20",
    );
    assert.deepEqual(
      items.map((item) => [item.id, item.start, item.participantIds]),
      [
        ["t1", "2026-10-03", ["a"]],
        ["t1:2026-10-10", "2026-10-10", ["b"]],
        ["t1:2026-10-17", "2026-10-17", ["c"]],
      ],
    );
  });
});

// ── Total list, repeat presets, links, linked tasks, pay tasks ────────────────────────────────────────

describe("the total list by day", () => {
  const today = "2026-10-02";
  const open = (id: string, dueDate: string | null, patch: Partial<Task> = {}): Task => ({
    ...baseTask,
    id,
    title: id,
    rrule: null,
    recurrenceStart: null,
    rotateAssignees: false,
    assigneeIds: [],
    dueDate,
    ...patch,
  });
  const tasks = [
    open("late", "2026-09-30"),
    open("now", today),
    open("tomorrow", "2026-10-03"),
    open("week", "2026-10-09"),
    open("later", "2026-10-10"),
    open("whenever", null),
    open("dishes", today, { status: "done", closedAt: "2026-10-02T17:00:00.000Z" }),
    open("weekly", "2026-10-09", { rrule: "FREQ=WEEKLY", recurrenceStart: "2026-09-25" }),
  ];
  const completedToday = [
    { completionId: "c1", taskId: "dishes", outcome: "done" as const, occurrenceDate: today, completedAt: "2026-10-02T17:00:00.000Z", completedById: "a" },
    { completionId: "c2", taskId: "weekly", outcome: "done" as const, occurrenceDate: today, completedAt: "2026-10-02T08:00:00.000Z", completedById: "b" },
  ];
  const filters = parseTaskFilters(new URLSearchParams(""), null);

  it("defaults to everything for everyone", () => {
    assert.equal(parseTaskFilters(new URLSearchParams(""), "a").view, "all");
    assert.equal(taskFiltersToParams(parseTaskFilters(new URLSearchParams(""), "a"), "a").toString(), "");
  });

  it("groups open tasks by day and puts today's done items in their day, last", () => {
    assert.deepEqual(
      ["2026-09-01", today, "2026-10-03", "2026-10-04", "2026-10-09", "2026-10-10", null].map((date) => dayGroupOf(date, today)),
      ["overdue", "today", "tomorrow", "week", "week", "later", "none"],
    );
    const openTasks = applyTaskFilters(tasks, filters, { today });
    const done = completedTodayEntries(tasks, completedToday, filters, { today });
    const groups = groupByDay(openTasks, done, today);
    assert.deepEqual(
      groups.map((group) => [group.key, group.done, group.total]),
      [
        ["overdue", 0, 1],
        ["today", 2, 3],
        ["tomorrow", 0, 1],
        ["week", 0, 2],
        ["later", 0, 1],
        ["none", 0, 1],
      ],
    );
    assert.deepEqual(groups[1]?.entries.map((entry) => [entry.task.id, entry.done]), [["now", false], ["weekly", true], ["dishes", true]]);
  });

  it("counts today's progress: done today of done + overdue + today", () => {
    const openTasks = applyTaskFilters(tasks, filters, { today });
    const done = completedTodayEntries(tasks, completedToday, filters, { today });
    assert.deepEqual(todayProgress(openTasks, done, today), { done: 2, total: 4, allDoneToday: false, allDone: false });
    const rest = openTasks.filter((task) => task.id !== "late" && task.id !== "now");
    assert.deepEqual(todayProgress(rest, done, today), { done: 2, total: 2, allDoneToday: true, allDone: false });
    assert.deepEqual(todayProgress([], done, today), { done: 2, total: 2, allDoneToday: true, allDone: true });
  });

  it("filters today's done items like the open ones", () => {
    const mine = completedTodayEntries(tasks, completedToday, { ...filters, view: "mine" }, { today, currentHabitantId: "b" });
    assert.deepEqual(mine.map((entry) => entry.task.id), ["weekly"]);
    assert.deepEqual(completedTodayEntries(tasks, completedToday, { ...filters, view: "overdue" }, { today }), []);
  });
});

describe("repeat presets", () => {
  // 2026-10-02 is a Friday.
  it("turns presets into rules on the due date's weekday, or the weekdays picked", () => {
    assert.equal(presetRRule("daily", "2026-10-02"), "FREQ=DAILY");
    assert.equal(presetRRule("weekly", "2026-10-02"), "FREQ=WEEKLY;BYDAY=FR");
    assert.equal(presetRRule("weekly", "2026-10-02", null, ["SU"]), "FREQ=WEEKLY;BYDAY=SU");
    assert.equal(presetRRule("biweekly", "2026-10-02", null, ["TH", "MO"]), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH");
    assert.equal(presetRRule("biweekly", "2026-10-05"), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO");
    assert.equal(presetRRule("monthly", "2026-10-02", "2027-06-30"), "FREQ=MONTHLY;UNTIL=20270630");
    assert.equal(presetRRule("yearly", "2026-10-02", "2026-01-01"), "FREQ=YEARLY", "an end before the start is ignored");
  });

  it("recognises stored rules, and the rest is custom", () => {
    assert.deepEqual(repeatPresetOf("FREQ=WEEKLY;BYDAY=FR", "2026-10-02"), { preset: "weekly", until: null, weekdays: ["FR"] });
    assert.deepEqual(repeatPresetOf("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;UNTIL=20261231", "2026-10-02"), {
      preset: "biweekly",
      until: "2026-12-31",
      weekdays: ["FR"],
    });
    // Other weekdays are still the weekly preset, with those days ("every Sunday", "Monday and Thursday").
    assert.deepEqual(repeatPresetOf("FREQ=WEEKLY;BYDAY=SU", "2026-10-02"), { preset: "weekly", until: null, weekdays: ["SU"] });
    assert.deepEqual(repeatPresetOf("FREQ=WEEKLY;BYDAY=MO,TH", "2026-10-02")?.weekdays, ["MO", "TH"]);
    assert.equal(repeatPresetOf("FREQ=WEEKLY;INTERVAL=3;BYDAY=MO", "2026-10-02")?.preset, "custom");
    assert.equal(repeatPresetOf("FREQ=MONTHLY;COUNT=3", "2026-10-02")?.preset, "custom");
    assert.equal(repeatPresetOf(null, "2026-10-02"), null);
  });

  it("a weekly task with an end date moves on, then closes after its last date", () => {
    const task = { rrule: "FREQ=WEEKLY;BYDAY=FR;UNTIL=20261009", recurrenceStart: "2026-10-02" };
    assert.equal(nextDueDate({ ...task, occurrenceDate: "2026-10-02" }, "2026-10-02"), "2026-10-09");
    assert.equal(nextDueDate({ ...task, occurrenceDate: "2026-10-09" }, "2026-10-09"), null);
  });
});

describe("task links", () => {
  const edges = [["pay", "invoice"], ["invoice", "readings"]] as const;
  it("refuses links that would make tasks wait for each other", () => {
    assert.equal(wouldCreateCycle(edges, "readings", "pay"), true, "readings → pay → invoice → readings");
    assert.equal(wouldCreateCycle(edges, "invoice", "pay"), true);
    assert.equal(wouldCreateCycle(edges, "pay", "pay"), true);
    assert.equal(wouldCreateCycle(edges, "pay", "readings"), false);
    assert.equal(wouldCreateCycle([], "dishwasher", "dishes"), false);
  });

  it("only open tasks with open blockers wait", () => {
    const blocker = { id: "x", title: "Calculate", status: "open" as const, dueDate: null };
    assert.equal(isWaiting({ status: "open", waitingFor: [blocker] }), true);
    assert.equal(isWaiting({ status: "open", waitingFor: [] }), false);
    assert.equal(isWaiting({ status: "done", waitingFor: [blocker] }), false);
  });
});

describe("linked tasks", () => {
  const existing = {
    title: "Put out: Pmd",
    type: "chore" as const,
    dueDate: "2026-10-06",
    dueTime: "20:00",
    originDate: "2026-10-07",
    originHref: "/settings#waste",
    assigneeIds: ["a"],
  };
  const wanted = {
    title: "Put out: Pmd",
    type: "chore" as const,
    dueDate: "2026-10-06",
    dueTime: "20:00",
    origin: { type: "waste", id: "2026-10-07", date: "2026-10-07", href: "/settings#waste" },
  };

  it("is idempotent: a matching task needs no change", () => {
    assert.deepEqual(linkedTaskChanges(existing, wanted), { changes: {} });
    assert.deepEqual(linkedTaskChanges(existing, { ...wanted, assigneeIds: ["a"] }), { changes: {} });
  });

  it("keeps a snoozed due date while the origin's date is the same", () => {
    assert.deepEqual(linkedTaskChanges({ ...existing, dueDate: "2026-10-07" }, wanted), { changes: {} });
  });

  it("follows a moved origin, a new timing, a new title and new assignees", () => {
    const moved = linkedTaskChanges(existing, { ...wanted, dueDate: "2026-10-07", origin: { ...wanted.origin, date: "2026-10-08" } });
    assert.deepEqual(moved.changes, { originDate: "2026-10-08", dueDate: "2026-10-07" });
    const morning = linkedTaskChanges(existing, { ...wanted, dueDate: "2026-10-07", dueTime: "07:00" });
    assert.deepEqual(morning.changes, { dueDate: "2026-10-07", dueTime: "07:00" });
    assert.deepEqual(linkedTaskChanges(existing, { ...wanted, title: "Put out: Pmd + Glas" }).changes, { title: "Put out: Pmd + Glas" });
    assert.deepEqual(linkedTaskChanges(existing, { ...wanted, assigneeIds: ["b"] }).assigneeIds, ["b"]);
  });
});

describe("pay tasks", () => {
  const today = "2026-10-02";
  const payment = (id: string, dueDate: string, patch: Partial<Parameters<typeof planPayTasks>[0]["payments"][number]> = {}) => ({
    id,
    payee: "Watergroep",
    amountCents: 5230,
    dueDate,
    payerType: "joint" as const,
    payerHabitantId: null,
    shares: [],
    ...patch,
  });

  it("titles them with payee and amount, in the household's language", () => {
    assert.match(payTaskTitle("Watergroep", 5230, "nl"), /^Betaal Watergroep · € 52,30$/);
    assert.match(payTaskTitle("Watergroep", 5230, "en"), /^Pay Watergroep · €\s?52[.,]30$/);
  });

  it("are due the day before, for whoever pays", () => {
    const plan = planPayTasks({
      payments: [
        payment("joint", "2026-10-10"),
        payment("person", "2026-10-05", { payerType: "person", payerHabitantId: "rob" }),
        payment("split", "2026-10-03", { payerType: "split", shares: [{ habitantId: "rob", amountCents: 2000 }, { habitantId: "sofie", amountCents: 3230 }] }),
        payment("far", "2026-11-30"),
        payment("overdue", "2026-09-20"),
      ],
      existing: [],
      today,
      locale: "en",
    });
    assert.deepEqual(
      plan.upserts.map((item) => [item.expenseId, item.dueDate, item.assigneeIds]),
      [
        ["joint", "2026-10-09", []],
        ["person", "2026-10-04", ["rob"]],
        ["split", "2026-10-02", ["rob", "sofie"]],
        ["overdue", "2026-09-19", []],
      ],
    );
  });

  it("leaves tasks of paid, deleted or direct-debit expenses to the caller, and keeps people's own assignees", () => {
    const plan = planPayTasks({
      payments: [payment("person", "2026-10-05", { payerType: "person", payerHabitantId: "rob" })],
      existing: [
        { originId: "person", status: "open", assigneeIds: ["sofie"] },
        { originId: "paid", status: "open", assigneeIds: [] },
      ],
      today,
      locale: "en",
    });
    assert.equal(plan.upserts[0]?.assigneeIds, undefined);
    assert.deepEqual(plan.others, ["paid"]);
  });

  it("assigns by payer type", () => {
    assert.deepEqual(payTaskAssignees({ payerType: "joint", payerHabitantId: null, shares: [] }), []);
    assert.deepEqual(payTaskAssignees({ payerType: "person", payerHabitantId: "rob", shares: [] }), ["rob"]);
    assert.deepEqual(
      payTaskAssignees({ payerType: "split", payerHabitantId: null, shares: [{ habitantId: "a", amountCents: 0 }, { habitantId: "b", amountCents: 1 }] }),
      ["b"],
    );
  });
});
