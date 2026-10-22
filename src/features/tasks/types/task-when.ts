import { addDays } from "@/types/dates";
import { ALL_DAY_REMINDER_PRESETS, REMINDER_PRESETS, taskWhenKind, type TaskWhenKind } from "./tasks";

/**
 * The task form's "When" control as one value, and its mapping to the task's columns. Pure, so the form, its
 * stories and the tests agree. See `TASK_WHEN_KINDS` for what each kind means.
 *
 * - `date`: the day (day, moment, slot) or the last day (several days); `startDate`: the first day (several days).
 * - `time`: the time (moment) or the start (slot); `endTime`: the end (slot).
 *
 * Fields that don't belong to the kind are kept while the form is open (switching back restores them) but never
 * posted.
 */
export type TaskWhenValue = { kind: TaskWhenKind; date: string; time: string; endTime: string; startDate: string };

/** The columns the control posts (and shows the errors of). */
export const TASK_WHEN_NAMES = ["dueDate", "dueTime", "endTime", "startDate"] as const;

export const EMPTY_WHEN: TaskWhenValue = { kind: "none", date: "", time: "", endTime: "", startDate: "" };

/** The control's value for a task (or the defaults of a new one). */
export function whenValueOf(task: { dueDate?: string | null; dueTime?: string | null; endTime?: string | null; startDate?: string | null }): TaskWhenValue {
  const dueDate = task.dueDate ?? null;
  return {
    kind: taskWhenKind({ dueDate, dueTime: task.dueTime, endTime: task.endTime, startDate: task.startDate }),
    date: dueDate ?? "",
    time: task.dueTime ?? "",
    endTime: task.endTime ?? "",
    startDate: task.startDate ?? "",
  };
}

/** What the control posts: the task's columns as form strings ("" = none). */
export function whenColumns(value: TaskWhenValue): { dueDate: string; dueTime: string; endTime: string; startDate: string } {
  switch (value.kind) {
    case "none":
      return { dueDate: "", dueTime: "", endTime: "", startDate: "" };
    case "day":
      return { dueDate: value.date, dueTime: "", endTime: "", startDate: "" };
    case "moment":
      return { dueDate: value.date, dueTime: value.time, endTime: "", startDate: "" };
    case "slot":
      return { dueDate: value.date, dueTime: value.time, endTime: value.endTime, startDate: "" };
    case "days":
      return { dueDate: value.date, dueTime: "", endTime: "", startDate: value.startDate };
  }
}

/** `HH:MM` plus `minutes`, capped at 23:59 (a timeslot stays on its day). */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes, 23 * 60 + 59);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * Switch the control to another kind, keeping what fits: a date is filled in (today) when the new kind needs
 * one; several days start on the current day and end the day after; leaving several days keeps the first day.
 */
export function switchWhenKind(value: TaskWhenValue, kind: TaskWhenKind, today: string): TaskWhenValue {
  if (kind === value.kind) return value;
  if (kind === "none") return { ...value, kind };
  if (kind === "days") {
    const first = value.kind === "days" ? value.startDate : value.date || today;
    const last = value.kind === "days" ? value.date : value.startDate && value.startDate > first ? value.startDate : addDays(first, 1);
    return { ...value, kind, startDate: first, date: last > first ? last : addDays(first, 1) };
  }
  const date = value.kind === "days" ? value.startDate || value.date : value.date || today;
  const next = { ...value, kind, date };
  if (kind === "slot" && next.time && (!next.endTime || next.endTime <= next.time)) next.endTime = addMinutesToTime(next.time, 60);
  return next;
}

/** A new start time: a timeslot whose end is missing or no longer after it ends an hour later. */
export function withStartTime(value: TaskWhenValue, time: string): TaskWhenValue {
  const next = { ...value, time };
  if (value.kind === "slot" && time && (!value.endTime || value.endTime <= time)) next.endTime = addMinutesToTime(time, 60);
  return next;
}

/** A new first day of several days: the last day moves along when it would come before it. */
export function withStartDate(value: TaskWhenValue, startDate: string): TaskWhenValue {
  return { ...value, startDate, date: startDate && value.date && value.date <= startDate ? addDays(startDate, 1) : value.date };
}

/** Timed kinds count a reminder back from their time; the rest from 09:00 on the (first) day. */
export const isTimedWhen = (kind: TaskWhenKind) => kind === "moment" || kind === "slot";

/** The reminder choices for a kind, plus the task's current one when it isn't a preset. */
export function reminderChoices(kind: TaskWhenKind, current: number | null | undefined): number[] {
  const presets: readonly number[] = isTimedWhen(kind) ? REMINDER_PRESETS : ALL_DAY_REMINDER_PRESETS;
  return [...new Set([...presets, ...(current != null ? [current] : [])])].sort((a, b) => a - b);
}
