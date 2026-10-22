import { presetRRule, repeatPresetOf } from "@/features/tasks/types/task-repeat";
import { taskFirstDay, taskInputSchema, taskSpanDays, type Task, type TaskInput } from "@/features/tasks/types/tasks";
import { addDays } from "@/types/dates";
import { WEEKDAY_CODES, weekdayCodeOf, type WeekdayCode } from "@/types/recurrence";
import { fold } from "@ai/core/text-match";

/**
 * Pure argument mapping for the tasks (and calendar) tools, so the tests can check it without a database.
 */

/** The repeat choices the assistant offers: the task form's presets, or "none" to stop repeating. */
export const REPEAT_CHOICES = ["none", "daily", "weekly", "biweekly", "monthly", "yearly"] as const;
export type RepeatChoice = (typeof REPEAT_CHOICES)[number];

/** The assistant's weekday names ("every Sunday" = `["sun"]`), Monday first like the RRULE codes. */
export const WEEKDAY_ARGS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayArg = (typeof WEEKDAY_ARGS)[number];

/** `["sun"]` → `["SU"]`. */
export const weekdayCodes = (days: readonly WeekdayArg[] | undefined): WeekdayCode[] | undefined =>
  days?.length ? WEEKDAY_CODES.filter((_, index) => days.includes(WEEKDAY_ARGS[index] as WeekdayArg)) : undefined;

/**
 * The RRULE of a repeat choice starting on `startDate`, `null` for "none", `undefined` when nothing was asked
 * (keep what there is). Weekly choices repeat on `weekdays` (e.g. `["SU"]`), by default on the start's weekday.
 */
export function repeatRule(
  repeat: RepeatChoice | undefined,
  startDate: string | null | undefined,
  until?: string | null,
  weekdays?: readonly WeekdayCode[],
): string | null | undefined {
  if (repeat === undefined) return undefined;
  if (repeat === "none" || !startDate) return null;
  return presetRRule(repeat, startDate, until ?? null, weekdays);
}

/**
 * The first day of a new repeating task on `weekdays` when no date was said ("elke zondag om 18u"): today when
 * today is one of them and its time (if any) is still to come, otherwise the next such day. `undefined` without
 * weekdays. The tasks service aligns any date to the rule as well; this only avoids a first time already past.
 */
export function firstWeekdayDate(weekdays: readonly WeekdayCode[] | undefined, today: string, time: string | null | undefined, nowTime: string): string | undefined {
  if (!weekdays?.length) return undefined;
  for (let offset = 0; offset < 8; offset += 1) {
    const date = addDays(today, offset);
    if (!weekdays.includes(weekdayCodeOf(date))) continue;
    if (offset === 0 && time && time <= nowTime) continue;
    return date;
  }
  return undefined;
}

/** What an edit may change; everything left out stays as it is. */
export type TaskChanges = {
  title?: string;
  /** The (first) day; `null` removes the date and what depends on it. A multi-day task keeps its length. */
  dueDate?: string | null;
  /** The last day of a task over several days (all day); the same day as `dueDate` (or `null`) = one day. */
  endDate?: string | null;
  assigneeIds?: string[];
  placeId?: string | null;
  priority?: TaskInput["priority"];
  type?: TaskInput["type"];
  notes?: string | null;
  estimatedMinutes?: number | null;
  repeat?: RepeatChoice;
  repeatUntil?: string | null;
  /** Weekly repeats on these days; alone, it makes a weekly task (or changes the days of a weekly one). */
  weekdays?: WeekdayCode[];
  rotate?: boolean;
  addChecklist?: string[];
  /** `HH:MM` (the start of a timeslot), or `null` to remove the time (and the end time). */
  dueTime?: string | null;
  /** End of a timeslot `HH:MM`, or `null` for a moment. Kept when the start moves and it is still later. */
  endTime?: string | null;
  /** The assistant's `remind`: true = at the time, a number = minutes before, false = no reminder. */
  remind?: boolean | number;
};

/** The assistant's `remind` argument as `reminderMinutes`: true → 0 (at the time), false → none. */
export function reminderMinutesOf(remind: boolean | number | undefined): number | null | undefined {
  if (remind === undefined) return undefined;
  if (remind === false) return null;
  return remind === true ? 0 : remind;
}

/**
 * The full `TaskInput` for `updateTask` from the task as it is and the changes asked for. The checklist keeps
 * its items (and their ticks) and gets the new ones at the end; a changed date keeps the repeat rule (the
 * service restarts the schedule from the new date), the time, timeslot, number of days and reminder. Removing
 * the date removes what depends on it; several days are always all day (no time).
 */
export function mergeTaskInput(task: Task, changes: TaskChanges): TaskInput {
  const first = changes.dueDate !== undefined ? changes.dueDate : taskFirstDay(task);
  const span = taskSpanDays(task);
  const last = !first
    ? null
    : changes.endDate !== undefined
      ? changes.endDate && changes.endDate > first
        ? changes.endDate
        : first
      : addDays(first, span);
  const multiDay = Boolean(first && last && last > first);
  const dueDate = last;
  const askedTime = changes.dueTime !== undefined ? changes.dueTime : task.dueTime;
  const dueTime = dueDate && !multiDay ? askedTime : null;
  const keptEnd = task.endTime && dueTime && task.endTime > dueTime ? task.endTime : null;
  const endTime = dueTime ? (changes.endTime !== undefined ? changes.endTime : keptEnd) : null;
  const preset = repeatPresetOf(task.rrule, task.dueDate ?? dueDate ?? "")?.preset;
  // Weekdays alone: the days of a weekly task change, or it becomes weekly.
  const repeat = changes.repeat ?? (changes.weekdays?.length ? (preset === "biweekly" ? "biweekly" : "weekly") : undefined);
  const rule = repeatRule(repeat, dueDate, changes.repeatUntil, changes.weekdays);
  const asked = reminderMinutesOf(changes.remind);
  const reminderMinutes = dueDate ? (asked !== undefined ? asked : task.reminderMinutes) : null;
  return taskInputSchema.parse({
    title: changes.title ?? task.title,
    notes: changes.notes !== undefined ? changes.notes : task.notes,
    type: changes.type ?? task.type,
    placeId: changes.placeId !== undefined ? changes.placeId : (task.place?.id ?? null),
    assigneeIds: changes.assigneeIds ?? task.assigneeIds,
    dueDate,
    priority: changes.priority ?? task.priority,
    estimatedMinutes: changes.estimatedMinutes !== undefined ? changes.estimatedMinutes : task.estimatedMinutes,
    rrule: rule !== undefined ? rule : task.rrule,
    rotateAssignees: changes.rotate ?? task.rotateAssignees,
    dueTime,
    endTime,
    startDate: multiDay ? first : null,
    reminderMinutes,
    checklist: [
      ...task.checklist.map((item) => ({ label: item.label, done: item.done })),
      ...(changes.addChecklist ?? []).map((label) => ({ label, done: false })),
    ],
  });
}

/**
 * Candidates for a name lookup: every open thing, plus closed ones whose name no open one has (so "vink melk
 * af" never asks "the open or the bought one?", while a closed one-off can still be found to reopen it).
 */
export function openFirst<T>(open: T[], closed: T[], nameOf: (item: T) => string): T[] {
  const openNames = new Set(open.map((item) => fold(nameOf(item))));
  return [...open, ...closed.filter((item) => !openNames.has(fold(nameOf(item))))];
}
