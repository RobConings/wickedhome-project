/**
 * Unit tests for the bins tasks: collection days → planned linked tasks (timing, rotation, moved and
 * removed collections, done tasks untouched). Pure; no database calls.
 * Run: npx tsx --test src/api/waste/waste-tasks.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wasteTaskDue, wasteTaskTitle, type WasteDay, type WasteTaskSettings } from "@/features/waste/types/waste";
import { planWasteTasks } from "./waste-tasks";

const today = "2026-10-05"; // a Monday
const day = (date: string, ...labels: string[]): WasteDay => ({
  date,
  collections: labels.map((label) => ({ fraction: "other" as const, label, color: "#000000", note: null })),
});
const settings = (patch: Partial<WasteTaskSettings> = {}): WasteTaskSettings => ({
  enabled: true,
  timing: "evening_before",
  assigneeIds: [],
  rotate: true,
  ...patch,
});
type Existing = Parameters<typeof planWasteTasks>[0]["existing"][number];
const task = (date: string, title: string, patch: Partial<Existing> = {}): Existing => ({
  originId: date,
  originDate: date,
  status: "open",
  title,
  assigneeIds: [],
  ...patch,
});

describe("bins task timing and title", () => {
  it("is due 20:00 the evening before, or 07:00 that morning", () => {
    assert.deepEqual(wasteTaskDue("2026-10-07", "evening_before"), { dueDate: "2026-10-06", dueTime: "20:00" });
    assert.deepEqual(wasteTaskDue("2026-10-01", "evening_before"), { dueDate: "2026-09-30", dueTime: "20:00" });
    assert.deepEqual(wasteTaskDue("2026-10-07", "morning_of"), { dueDate: "2026-10-07", dueTime: "07:00" });
  });

  it("names the bins in the household's language", () => {
    assert.equal(wasteTaskTitle([{ label: "Papier & karton" }, { label: "Pmd" }], "en"), "Put out: Papier & karton + Pmd");
    assert.equal(wasteTaskTitle([{ label: "Pmd" }], "nl"), "Buitenzetten: Pmd");
  });
});

describe("planning bins tasks", () => {
  const days = [day("2026-10-01", "Pmd"), day("2026-10-07", "Papier & karton", "Pmd"), day("2026-10-14", "Restafval"), day("2026-11-30", "Glas")];

  it("plans one task per collection day from today up to two weeks ahead", () => {
    const plan = planWasteTasks({ days, settings: settings(), today, locale: "en", existing: [] });
    assert.deepEqual(
      plan.upserts.map((item) => [item.date, item.title, item.dueDate, item.dueTime]),
      [
        ["2026-10-07", "Put out: Papier & karton + Pmd", "2026-10-06", "20:00"],
        ["2026-10-14", "Put out: Restafval", "2026-10-13", "20:00"],
      ],
    );
    assert.deepEqual(plan.removals, []);
  });

  it("follows the timing setting", () => {
    const plan = planWasteTasks({ days, settings: settings({ timing: "morning_of" }), today, locale: "en", existing: [] });
    assert.deepEqual(plan.upserts.map((item) => [item.dueDate, item.dueTime]), [["2026-10-07", "07:00"], ["2026-10-14", "07:00"]]);
  });

  it("is idempotent: planning against its own result changes nothing", () => {
    const first = planWasteTasks({ days, settings: settings(), today, locale: "en", existing: [] });
    const existing = first.upserts.map((item) => task(item.date, item.title));
    const second = planWasteTasks({ days, settings: settings(), today, locale: "en", existing });
    assert.deepEqual(second.removals, []);
    assert.deepEqual(second.upserts.map((item) => [item.date, item.title, item.assigneeIds]), first.upserts.map((item) => [item.date, item.title, item.assigneeIds]));
  });

  it("removes open tasks for collections that disappeared or passed, never done ones", () => {
    const existing = [
      task("2026-10-03", "Put out: Pmd"), // passed
      task("2026-10-09", "Put out: Glas"), // cancelled
      task("2026-10-02", "Put out: Restafval", { status: "done" }),
      task("2026-10-07", "Put out: Papier & karton + Pmd", { status: "done" }),
    ];
    const plan = planWasteTasks({ days, settings: settings(), today, locale: "en", existing });
    assert.deepEqual(plan.removals.sort(), ["2026-10-03", "2026-10-09"]);
    // A day whose task is already done gets no new one.
    assert.deepEqual(plan.upserts.map((item) => item.date), ["2026-10-14"]);
  });

  it("moves the task along when a collection moves a few days (holiday shift)", () => {
    const moved = [day("2026-10-08", "Papier & karton", "Pmd"), day("2026-10-14", "Restafval")];
    const existing = [task("2026-10-07", "Put out: Papier & karton + Pmd", { assigneeIds: ["sofie"] })];
    const plan = planWasteTasks({ days: moved, settings: settings(), today, locale: "en", existing });
    assert.deepEqual(plan.removals, []);
    const item = plan.upserts.find((candidate) => candidate.date === "2026-10-08");
    assert.equal(item?.movedFrom, "2026-10-07");
    assert.equal(item?.dueDate, "2026-10-07");
    assert.equal(item?.assigneeIds, undefined, "keeps who it was assigned to");
  });

  it("switched off: no tasks, open ones removed", () => {
    const existing = [task("2026-10-07", "Put out: Papier & karton + Pmd"), task("2026-10-14", "Put out: Restafval", { status: "skipped" })];
    const plan = planWasteTasks({ days, settings: settings({ enabled: false }), today, locale: "en", existing });
    assert.deepEqual(plan.upserts, []);
    assert.deepEqual(plan.removals, ["2026-10-07"]);
  });

  it("takes turns after whoever had the previous bins task", () => {
    const existing = [task("2026-09-30", "Put out: Pmd", { status: "done", assigneeIds: ["rob"] })];
    const weekly = [day("2026-10-07", "Pmd"), day("2026-10-10", "Glas"), day("2026-10-14", "Restafval")];
    const plan = planWasteTasks({ days: weekly, settings: settings({ assigneeIds: ["rob", "sofie"] }), today, locale: "en", existing });
    assert.deepEqual(plan.upserts.map((item) => item.assigneeIds), [["sofie"], ["rob"], ["sofie"]]);
  });

  it("without rotation, everyone chosen gets every task; nobody chosen keeps assignees as they are", () => {
    const together = planWasteTasks({ days, settings: settings({ assigneeIds: ["rob", "sofie"], rotate: false }), today, locale: "en", existing: [] });
    assert.deepEqual(together.upserts[0]?.assigneeIds, ["rob", "sofie"]);
    const nobody = planWasteTasks({ days, settings: settings(), today, locale: "en", existing: [] });
    assert.equal(nobody.upserts[0]?.assigneeIds, undefined);
  });

  it("respects a person's own assignment within the chosen people", () => {
    const existing = [task("2026-10-07", "Put out: Papier & karton + Pmd", { assigneeIds: ["rob"] })];
    const plan = planWasteTasks({ days, settings: settings({ assigneeIds: ["rob", "sofie"] }), today, locale: "en", existing });
    assert.equal(plan.upserts[0]?.assigneeIds, undefined);
    assert.deepEqual(plan.upserts[1]?.assigneeIds, ["sofie"]);
  });
});
