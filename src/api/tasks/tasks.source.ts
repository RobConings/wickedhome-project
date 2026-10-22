import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import { zonedToUtc } from "@/features/calendar/types/calendar-time";
import { onDutyIds, taskPath, taskSpanDays, taskWhenKind, upcomingDueDates } from "@/features/tasks/types/tasks";
import { addDays, daysBetween } from "@/types/dates";
import type { CalendarSource } from "../calendar/calendar-sources";
import { db } from "../lib/db";

/** Projected occurrences of one recurring task, at most this many per range. */
const MAX_PROJECTED = 60;
/** A timed task without an estimate takes this long in the hour grid; a long estimate is capped. */
const DEFAULT_TIMED_MINUTES = 30;
const MAX_TIMED_MINUTES = 12 * 60;

type SourceTask = {
  id: string;
  title: string;
  dueDate: string;
  /** `HH:MM`: the task sits at that hour in the calendar; `null`: all day. */
  dueTime?: string | null;
  /** Timeslot: the block runs from `dueTime` to this `HH:MM`. */
  endTime?: string | null;
  /** Several days: the first day; the entry spans the all-day row up to the due date. */
  startDate?: string | null;
  estimatedMinutes?: number | null;
  /** The task has a reminder (a bell on the entry). */
  reminder?: boolean;
  rrule: string | null;
  recurrenceStart: string | null;
  occurrenceDate: string | null;
  assigneeIds: string[];
  rotateAssignees: boolean;
  placeName: string | null;
  priority: string;
  type: string;
};

/**
 * Calendar items for open tasks between `from` and `to` (inclusive): each task on its due date, plus
 * the coming occurrences of recurring tasks (with whoever's turn it will be when the task rotates).
 *
 * How a task shows follows its "when": all day; a moment at its hour (30 minutes, or the estimate); a timeslot
 * as a block from its start to its end time; several days as one all-day entry from the first to the last day
 * (a bar across the week and month grids, on each of its days in Day and Agenda). Recurring tasks repeat the
 * same shape on every occurrence.
 */
export function taskItems(tasks: SourceTask[], from: string, to: string): CalendarOverlayItem[] {
  const items: CalendarOverlayItem[] = [];
  for (const task of tasks) {
    const base = {
      kind: "task" as const,
      title: task.title,
      location: task.placeName,
      href: taskPath(task.id),
      meta: { priority: task.priority, type: task.type, ...(task.reminder && { reminder: 1 }) },
    };
    const minutes = Math.min(task.estimatedMinutes ?? DEFAULT_TIMED_MINUTES, MAX_TIMED_MINUTES);
    const kind = taskWhenKind(task);
    const span = taskSpanDays(task);
    /** The entry of the occurrence due on `date`. */
    const when = (date: string) => {
      if (kind === "days") return { allDay: true, start: addDays(date, -span), end: date };
      if (!task.dueTime || (kind !== "moment" && kind !== "slot")) return { allDay: true, start: date };
      const start = zonedToUtc(date, task.dueTime);
      const end = kind === "slot" && task.endTime ? zonedToUtc(date, task.endTime) : new Date(start.getTime() + minutes * 60_000);
      return { allDay: false, start: start.toISOString(), end: end.toISOString() };
    };
    // A multi-day occurrence shows while any of its days is in the range.
    if (task.dueDate >= from && addDays(task.dueDate, -span) <= to) {
      items.push({ ...base, ...when(task.dueDate), id: task.id, participantIds: onDutyIds(task) });
    }
    if (!task.rrule || !task.recurrenceStart) continue;
    // Later occurrences: after the current scheduled one (and after a snoozed due date).
    const current = task.occurrenceDate ?? task.dueDate;
    const after = task.dueDate > current ? task.dueDate : current;
    const start = after >= from ? after : addDays(from, -1);
    const dates = upcomingDueDates(task, start, MAX_PROJECTED).filter((date) => addDays(date, -span) <= to);
    // Turns already passed between the current occurrence and `from` still count for the rotation.
    const skippedTurns = after >= from ? 0 : upcomingDueDates(task, after, 400).filter((date) => date < from).length;
    dates.forEach((date, index) => {
      const turn = skippedTurns + index + 1;
      const ids = task.assigneeIds;
      const participantIds = task.rotateAssignees && ids.length > 1 ? [ids[turn % ids.length] ?? ""] : ids;
      items.push({ ...base, ...when(date), id: `${task.id}:${date}`, participantIds, meta: { ...base.meta, projected: 1 } });
    });
  }
  return items;
}

/** Tasks on the household calendar: open tasks with a due date, and where recurring ones come back. */
export const tasksSource: CalendarSource = {
  id: "tasks",
  kind: "task",
  async load({ householdId, from, to }) {
    // Recurring tasks can project into the range from an earlier due date; ranges are at most a few months.
    const day0 = (date: string) => new Date(`${date}T00:00:00Z`);
    const rows = await db.task.findMany({
      where: {
        householdId,
        status: "OPEN",
        dueDate: { not: null },
        OR: [
          // Due in the range; recurring ones due earlier project into it.
          { dueDate: { gte: day0(from), lte: day0(to) } },
          { rrule: { not: null }, dueDate: { lte: day0(to) } },
          // Several days that started by the end of the range and aren't over before it.
          { startDate: { not: null, lte: day0(to) }, dueDate: { gte: day0(from) } },
        ],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        dueTime: true,
        endTime: true,
        startDate: true,
        estimatedMinutes: true,
        reminderMinutes: true,
        rrule: true,
        recurrenceStart: true,
        occurrenceDate: true,
        rotateAssignees: true,
        priority: true,
        type: true,
        place: { select: { name: true } },
        assignees: { select: { habitantId: true }, orderBy: { position: "asc" } },
      },
    });
    const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
    const tasks = rows.flatMap((row): SourceTask[] => {
      const dueDate = day(row.dueDate);
      if (!dueDate) return [];
      return [
        {
          id: row.id,
          title: row.title,
          dueDate,
          dueTime: row.dueTime,
          endTime: row.endTime,
          startDate: day(row.startDate),
          estimatedMinutes: row.estimatedMinutes,
          reminder: row.reminderMinutes !== null,
          rrule: row.rrule,
          recurrenceStart: day(row.recurrenceStart),
          occurrenceDate: day(row.occurrenceDate),
          assigneeIds: row.assignees.map((assignee) => assignee.habitantId),
          rotateAssignees: row.rotateAssignees,
          placeName: row.place?.name ?? null,
          priority: row.priority.toLowerCase(),
          type: row.type.toLowerCase(),
        },
      ];
    });
    // Guard against absurd ranges: the calendar asks for a month grid or a week.
    if (daysBetween(from, to) > 400) return [];
    return taskItems(tasks, from, to);
  },
};
