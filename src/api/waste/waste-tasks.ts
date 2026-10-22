import {
  DEFAULT_WASTE_TASK_SETTINGS,
  WASTE_TASK_DAYS,
  wasteTaskDue,
  wasteTaskTitle,
  type WasteDay,
  type WasteTaskSettings,
  type WasteTaskTiming,
} from "@/features/waste/types/waste";
import { addDays, daysBetween, todayIn } from "@/types/dates";
import { db, type WasteTaskTiming as WasteTaskTimingRow } from "../lib/db";
import { listLinkedTasks, rekeyLinkedTask, removeLinkedTask, upsertLinkedTask, type LinkedTaskState } from "../tasks/linked-tasks";

/*
 * Bins tasks: one linked task per collection day ("Put out: Pmd + Papier & karton", a chore), due the
 * evening before at 20:00 or that morning at 07:00, for the collection days in the coming two weeks.
 * Planned by the pure `planWasteTasks` and applied after every waste sync (the daily `waste.sync` job,
 * "Refresh now", saving the collector) and when the setting changes. Done or skipped tasks are never touched.
 */

export const WASTE_ORIGIN = "waste";
const WASTE_HREF = "/settings#waste";
/** A collection that moved by at most this many days keeps its task (assignee, notes, comments). */
const MOVE_DAYS = 7;

export type WasteTaskPlanItem = {
  /** The collection day = the task's origin id. */
  date: string;
  title: string;
  dueDate: string;
  dueTime: string;
  /** `undefined`: keep the task's current assignees. */
  assigneeIds?: string[];
  /** The collection moved here from this day: re-key that task instead of creating a new one. */
  movedFrom?: string;
};

export type WasteTaskPlan = { upserts: WasteTaskPlanItem[]; removals: string[] };

type PlanInput = {
  /** Collection days, any range (only today … today + `WASTE_TASK_DAYS` get tasks). */
  days: WasteDay[];
  settings: WasteTaskSettings;
  today: string;
  /** "en" or "nl": the language of the stored titles. */
  locale: string;
  /** The household's existing waste tasks, any status. */
  existing: Pick<LinkedTaskState, "originId" | "originDate" | "status" | "title" | "assigneeIds">[];
  horizonDays?: number;
};

/**
 * What the household's bins tasks should be. Pure: the sync applies it. Rules:
 * - one task per collection day from today up to the horizon; switched off, no tasks;
 * - open tasks for days without a collection (moved, cancelled, past) are removed, unless the collection
 *   moved by at most a week to a day without a task: then that task moves along;
 * - done and skipped tasks are never changed or removed, and a day with one gets no new task;
 * - assignees: with rotation, one person per day taking turns after whoever had the previous bins task;
 *   without, everyone chosen. A task whose assignees a person already set (within the chosen ones, or
 *   anyone when none are chosen) keeps them.
 */
export function planWasteTasks({ days, settings, today, locale, existing, horizonDays = WASTE_TASK_DAYS }: PlanInput): WasteTaskPlan {
  const last = addDays(today, horizonDays);
  const wanted = settings.enabled ? days.filter((day) => day.date >= today && day.date <= last && day.collections.length > 0) : [];
  wanted.sort((a, b) => a.date.localeCompare(b.date));
  const byId = new Map(existing.map((task) => [task.originId, task]));
  const wantedIds = new Set(wanted.map((day) => day.date));

  // Open tasks whose collection day is gone: removed, unless the collection moved (same bins, close by).
  const orphans = existing.filter((task) => task.status === "open" && !wantedIds.has(task.originId));
  const moved = new Map<string, string>();
  for (const day of wanted) {
    if (byId.has(day.date)) continue;
    const title = wasteTaskTitle(day.collections, locale);
    const match = orphans.find(
      (task) =>
        !moved.has(task.originId) &&
        task.title === title &&
        task.originDate !== null &&
        task.originDate >= today &&
        Math.abs(daysBetween(task.originDate, day.date)) <= MOVE_DAYS,
    );
    if (match) moved.set(match.originId, day.date);
  }
  const movedTo = new Map([...moved].map(([from, to]) => [to, from]));

  const chosen = settings.assigneeIds;
  const rotating = settings.rotate && chosen.length > 1;
  const within = (ids: string[]) => ids.length > 0 && (chosen.length === 0 || ids.every((id) => chosen.includes(id)));
  // Whose turn it was last: the latest bins task before the first planned day with one chosen person.
  const firstDate = wanted[0]?.date ?? last;
  let previous =
    [...existing]
      .filter((task) => task.originDate !== null && task.originDate < firstDate && task.assigneeIds.length === 1)
      .sort((a, b) => (a.originDate ?? "").localeCompare(b.originDate ?? ""))
      .at(-1)?.assigneeIds[0] ?? null;

  const upserts: WasteTaskPlanItem[] = [];
  for (const day of wanted) {
    const movedFrom = movedTo.get(day.date);
    const current = byId.get(day.date) ?? (movedFrom ? byId.get(movedFrom) : undefined);
    if (current && current.status !== "open") {
      if (current.assigneeIds.length === 1) previous = current.assigneeIds[0] ?? previous;
      continue;
    }
    let assigneeIds: string[] | undefined;
    if (current && within(current.assigneeIds)) {
      assigneeIds = undefined;
      if (current.assigneeIds.length === 1) previous = current.assigneeIds[0] ?? previous;
    } else if (rotating) {
      const index = previous ? chosen.indexOf(previous) : -1;
      const next = chosen[(index + 1) % chosen.length] ?? chosen[0] ?? "";
      assigneeIds = [next];
      previous = next;
    } else {
      assigneeIds = chosen.length > 0 ? [...chosen] : undefined;
    }
    upserts.push({
      date: day.date,
      title: wasteTaskTitle(day.collections, locale),
      ...wasteTaskDue(day.date, settings.timing),
      ...(assigneeIds !== undefined && { assigneeIds }),
      ...(movedFrom && { movedFrom }),
    });
  }

  return { upserts, removals: orphans.filter((task) => !moved.has(task.originId)).map((task) => task.originId) };
}

// ── Applying the plan ─────────────────────────────────────────────────────────────────────────────────

const toTiming = (timing: WasteTaskTimingRow) => timing.toLowerCase() as WasteTaskTiming;
export const fromTiming = (timing: WasteTaskTiming) => timing.toUpperCase() as WasteTaskTimingRow;

export function wasteTaskSettingsOf(row: {
  taskEnabled: boolean;
  taskTiming: WasteTaskTimingRow;
  taskAssigneeIds: string[];
  taskRotate: boolean;
} | null): WasteTaskSettings {
  if (!row) return DEFAULT_WASTE_TASK_SETTINGS;
  return { enabled: row.taskEnabled, timing: toTiming(row.taskTiming), assigneeIds: row.taskAssigneeIds, rotate: row.taskRotate };
}

/** The language for stored titles: the first owner's, else any account's, else English. */
async function householdLocale(householdId: string): Promise<string> {
  const users = await db.user.findMany({ where: { householdId }, select: { locale: true, role: true }, orderBy: { createdAt: "asc" } });
  return (users.find((user) => user.role === "OWNER") ?? users[0])?.locale ?? "en";
}

export type WasteTaskSyncResult = { created: number; updated: number; removed: number };

/**
 * Brings the household's bins tasks in line with its collection days and setting. Idempotent. `days` may
 * be passed when the caller has them; otherwise they're read from the stored collections.
 */
export async function syncWasteTasks(householdId: string, loadDays: (from: string, to: string) => Promise<WasteDay[]>): Promise<WasteTaskSyncResult> {
  const today = todayIn();
  const setup = await db.wasteSetup.findUnique({
    where: { householdId },
    select: { taskEnabled: true, taskTiming: true, taskAssigneeIds: true, taskRotate: true },
  });
  const settings = wasteTaskSettingsOf(setup);
  // Habitants removed since the setting was saved are dropped.
  const known = new Set(
    (await db.habitant.findMany({ where: { householdId, id: { in: settings.assigneeIds } }, select: { id: true } })).map((row) => row.id),
  );
  const effective = { ...settings, enabled: Boolean(setup) && settings.enabled, assigneeIds: settings.assigneeIds.filter((id) => known.has(id)) };

  const [days, existing, locale] = await Promise.all([
    effective.enabled ? loadDays(today, addDays(today, WASTE_TASK_DAYS)) : Promise.resolve([]),
    listLinkedTasks(householdId, WASTE_ORIGIN),
    householdLocale(householdId),
  ]);
  const plan = planWasteTasks({ days, settings: effective, today, locale, existing });

  const result: WasteTaskSyncResult = { created: 0, updated: 0, removed: 0 };
  for (const item of plan.upserts) {
    if (item.movedFrom) await rekeyLinkedTask({ householdId, type: WASTE_ORIGIN, fromId: item.movedFrom, toId: item.date });
    const { action } = await upsertLinkedTask({
      householdId,
      origin: { type: WASTE_ORIGIN, id: item.date, date: item.date, href: WASTE_HREF },
      title: item.title,
      type: "chore",
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      ...(item.assigneeIds !== undefined && { assigneeIds: item.assigneeIds }),
    });
    if (action === "created") result.created += 1;
    else if (action === "updated") result.updated += 1;
  }
  for (const originId of plan.removals) {
    if (await removeLinkedTask({ householdId, type: WASTE_ORIGIN, id: originId })) result.removed += 1;
  }
  return result;
}
