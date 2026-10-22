/**
 * The tasks skill: argument mapping (repeat presets, edits merged into the full form input, name lookups that
 * prefer open things, checklist items by label) and who may use which tool. No database needed:
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/tasks/tools.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Task } from "@/features/tasks/types/tasks";
import { listAssistantTools } from "@ai/core/tools";
import "@ai/skills";
import { firstWeekdayDate, mergeTaskInput, openFirst, repeatRule, weekdayCodes } from "./task-input";
import { pickChecklistItem } from "./tools";

const task: Task = {
  id: "t1",
  title: "Gras maaien",
  notes: "Ook achteraan",
  type: "chore",
  place: null,
  assigneeIds: ["h1", "h2"],
  rotateAssignees: true,
  priority: "normal",
  estimatedMinutes: 30,
  status: "open",
  dueDate: "2026-10-06",
  rrule: "FREQ=WEEKLY;BYDAY=TU",
  recurrenceStart: "2026-10-06",
  checklist: [{ id: "c1", label: "Benzine", done: true }],
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

describe("tasks skill", () => {
  it("maps repeat choices to the form's presets", () => {
    assert.equal(repeatRule(undefined, "2026-10-06"), undefined);
    assert.equal(repeatRule("none", "2026-10-06"), null);
    assert.equal(repeatRule("weekly", "2026-10-06"), "FREQ=WEEKLY;BYDAY=TU");
    assert.equal(repeatRule("biweekly", "2026-10-08"), "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH");
    assert.equal(repeatRule("monthly", "2026-10-06", "2027-01-31"), "FREQ=MONTHLY;UNTIL=20270131");
    // Without a due date nothing can repeat.
    assert.equal(repeatRule("daily", null), null);
    // "Elke zondag": weekly on Sunday, whatever the start date's weekday.
    assert.equal(repeatRule("weekly", "2026-10-06", null, weekdayCodes(["sun"])), "FREQ=WEEKLY;BYDAY=SU");
    assert.deepEqual(weekdayCodes(["thu", "mon"]), ["MO", "TH"]);
  });

  it("starts 'every Sunday at 18:00' today when that is still to come, else next Sunday", () => {
    // 2026-10-04 is a Sunday.
    assert.equal(firstWeekdayDate(["SU"], "2026-10-04", "18:00", "10:15"), "2026-10-04");
    assert.equal(firstWeekdayDate(["SU"], "2026-10-04", "18:00", "19:00"), "2026-10-11");
    assert.equal(firstWeekdayDate(["SU"], "2026-10-01", "18:00", "19:00"), "2026-10-04");
    assert.equal(firstWeekdayDate(undefined, "2026-10-04", "18:00", "10:00"), undefined);
  });

  it("sets and keeps a timeslot and several days", () => {
    const slot = mergeTaskInput({ ...task, rrule: null }, { dueDate: "2026-10-10", dueTime: "10:00", endTime: "12:00" });
    assert.deepEqual([slot.dueDate, slot.dueTime, slot.endTime, slot.startDate], ["2026-10-10", "10:00", "12:00", null]);
    const timed = { ...task, rrule: null, dueDate: "2026-10-10", dueTime: "10:00", endTime: "12:00" };
    assert.equal(mergeTaskInput(timed, { dueTime: "11:00" }).endTime, "12:00", "the end stays while it is later");
    assert.equal(mergeTaskInput(timed, { dueTime: "13:00" }).endTime, null, "an end before the new start goes");
    // Several days: dueDate is the first day, endDate the last; the task is due on the last day, all day.
    const days = mergeTaskInput(timed, { dueDate: "2026-10-12", endDate: "2026-10-14" });
    assert.deepEqual([days.startDate, days.dueDate, days.dueTime, days.endTime], ["2026-10-12", "2026-10-14", null, null]);
    // Moving a multi-day task keeps its length; endDate on the first day makes it one day again.
    const span = { ...task, rrule: null, startDate: "2026-10-12", dueDate: "2026-10-14" };
    assert.deepEqual([mergeTaskInput(span, { dueDate: "2026-10-19" }).startDate, mergeTaskInput(span, { dueDate: "2026-10-19" }).dueDate], ["2026-10-19", "2026-10-21"]);
    assert.equal(mergeTaskInput(span, { endDate: "2026-10-12" }).startDate, null);
    // Weekdays alone make (or keep) it weekly on those days.
    assert.equal(mergeTaskInput(task, { weekdays: ["SU"] }).rrule, "FREQ=WEEKLY;BYDAY=SU");
  });

  it("merges an edit into the full task input, keeping everything else", () => {
    const same = mergeTaskInput(task, {});
    assert.equal(same.title, "Gras maaien");
    assert.deepEqual(same.assigneeIds, ["h1", "h2"]);
    assert.equal(same.rrule, "FREQ=WEEKLY;BYDAY=TU");
    assert.equal(same.rotateAssignees, true);
    assert.deepEqual(same.checklist, [{ label: "Benzine", done: true }]);

    const moved = mergeTaskInput(task, { dueDate: "2026-10-09", assigneeIds: ["h2"], addChecklist: ["Haag"], repeat: "none" });
    assert.equal(moved.dueDate, "2026-10-09");
    assert.equal(moved.rrule, null);
    assert.deepEqual(moved.assigneeIds, ["h2"]);
    assert.deepEqual(moved.checklist, [{ label: "Benzine", done: true }, { label: "Haag", done: false }]);

    const cleared = mergeTaskInput({ ...task, rrule: null }, { dueDate: null, notes: null });
    assert.equal(cleared.dueDate, null);
    assert.equal(cleared.notes, null);
  });

  it("keeps, sets and clears the time and reminder", () => {
    const timed = { ...task, dueTime: "21:00", reminderMinutes: 15 };
    const kept = mergeTaskInput(timed, { dueDate: "2026-10-09" });
    assert.equal(kept.dueTime, "21:00");
    assert.equal(kept.reminderMinutes, 15);
    const set = mergeTaskInput(task, { dueTime: "07:30", remind: true });
    assert.equal(set.dueTime, "07:30");
    assert.equal(set.reminderMinutes, 0);
    assert.equal(mergeTaskInput(timed, { remind: false }).reminderMinutes, null);
    assert.equal(mergeTaskInput(timed, { remind: 30 }).reminderMinutes, 30);
    const noTime = mergeTaskInput(timed, { dueTime: null });
    assert.equal(noTime.dueTime, null);
    // All day now: the reminder stays (it rings at 09:00 minus the offset).
    assert.equal(noTime.reminderMinutes, 15);
    const noDate = mergeTaskInput({ ...timed, rrule: null }, { dueDate: null });
    assert.equal(noDate.dueTime, null);
    assert.equal(noDate.reminderMinutes, null);
  });

  it("offers closed things only when no open one has the same name", () => {
    const open = [{ name: "Melk" }, { name: "Brood" }];
    const closed = [{ name: "melk" }, { name: "Eieren" }];
    assert.deepEqual(openFirst(open, closed, (item) => item.name).map((item) => item.name), ["Melk", "Brood", "Eieren"]);
  });

  it("finds a checklist item by (part of) its label", () => {
    const items = [{ label: "Benzine halen" }, { label: "Haag snoeien" }, { label: "Haag vegen" }];
    assert.deepEqual(pickChecklistItem(items, "benzine"), { label: "Benzine halen" });
    assert.deepEqual(pickChecklistItem(items, "Haag snoeien"), { label: "Haag snoeien" });
    assert.match(String(pickChecklistItem(items, "haag")), /Which item/);
    assert.match(String(pickChecklistItem(items, "ladder")), /No checklist item/);
  });

  it("lets children complete, comment and tick off, and nothing else", () => {
    const tools = listAssistantTools().filter((tool) => tool.skill === "tasks");
    const forChildren = tools.filter((tool) => tool.roles.includes("child")).map((tool) => tool.name).sort();
    assert.deepEqual(forChildren, ["tasks.check_item", "tasks.comment", "tasks.complete", "tasks.details", "tasks.list_open"]);
    const remove = tools.find((tool) => tool.name === "tasks.delete");
    assert.equal(remove?.permission, "sensitive");
    assert.equal(remove?.confirm, "always");
  });
});
