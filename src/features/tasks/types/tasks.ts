import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import { addDays, daysBetween } from "@/types/dates";
import type { ProjectRef } from "@/types/projects";
import { expandRRule, isValidRRule, nextOccurrence, parseRRule } from "@/types/recurrence";
import { canManageHousehold } from "@/types/roles";

// ── Enums ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What kind of task it is: a household chore (vacuuming), a to-do (call the insurer), a job (insulate the
 * jacuzzi, often with materials), maintenance (boiler service) or an errand (post a parcel). The type
 * never depends on the place: a place is optional for every type.
 */
export const TASK_TYPES = ["chore", "todo", "job", "maintenance", "errand"] as const;
export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof taskTypeSchema>;

/** New tasks start as a household chore. */
export const DEFAULT_TASK_TYPE: TaskType = "chore";

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

/** A recurring task stays `open`; it only becomes `done`/`skipped` when its series ends. */
export const TASK_STATUSES = ["open", "done", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_OUTCOMES = ["done", "skipped"] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

/** Derived, never stored: *waiting for materials (n/m)* → *ready to start* → *done*. */
export const TASK_READINESS = ["waiting", "ready", "done"] as const;
export type TaskReadiness = (typeof TASK_READINESS)[number];

/** Inside or outside, from the task's place (a room or an outdoor zone). */
export const TASK_LOCATIONS = ["inside", "outside"] as const;
export type TaskLocation = (typeof TASK_LOCATIONS)[number];

/** Durations offered in the form, in minutes. */
export const ESTIMATE_PRESETS = [15, 30, 60, 120, 240, 480] as const;

export const MAX_CHECKLIST_ITEMS = 30;
/** Done and skipped tasks stay in the overview this long (they stay in each task's history forever). */
export const CLOSED_TASKS_DAYS = 30;

// ── Input ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Error messages this contract produces itself. They are codes, not text: the form translates them
 * (`tasks:errors.<code>`); zod's own messages are already localised.
 */
export const TASK_ERROR_CODES = [
  "dueDateRequired",
  "invalidRecurrence",
  "unknownPlace",
  "unknownHabitant",
  "unknownProject",
  "timeNeedsDate",
  "reminderNeedsDate",
  "endTimeNeedsTime",
  "endTimeBeforeStart",
  "startDateNeedsDate",
  "startDateAfterEnd",
  "daysTooLong",
  "daysAllDay",
] as const;
export type TaskErrorCode = (typeof TASK_ERROR_CODES)[number];

/** `HH:MM`, 24 h, for a due time (Europe/Brussels wall clock). */
export const dueTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * When a task happens ("the when"), derived from its columns, never stored:
 *
 * - `none`: no date ("whenever").
 * - `day`: all day on `dueDate`.
 * - `moment`: `dueDate` at `dueTime` ("zondag 18:00").
 * - `slot`: `dueDate` from `dueTime` to `endTime` ("zaterdag 10:00–12:00"); same day, end after start.
 * - `days`: all day from `startDate` to `dueDate` ("12/10 – 14/10"). Several days are always all-day: a time
 *   on the first or last day only would make reminders, the calendar and overdue harder to read for little gain.
 *
 * `dueDate` stays the day it is due (the last day), so overdue, the day groups, digests and links don't change.
 */
export const TASK_WHEN_KINDS = ["none", "day", "moment", "slot", "days"] as const;
export type TaskWhenKind = (typeof TASK_WHEN_KINDS)[number];

/** The longest multi-day task, in days from the first to the last day. */
export const MAX_TASK_DAYS = 366;

type WhenColumns = { dueDate?: string | null; dueTime?: string | null; endTime?: string | null; startDate?: string | null };

/** Which kind of "when" a task has (see `TASK_WHEN_KINDS`). */
export function taskWhenKind(task: WhenColumns): TaskWhenKind {
  if (!task.dueDate) return "none";
  if (task.startDate && task.startDate < task.dueDate) return "days";
  if (task.dueTime) return task.endTime ? "slot" : "moment";
  return "day";
}

/** The first day of a task: `startDate` for several days, else the due date; `null` without a date. */
export const taskFirstDay = (task: WhenColumns): string | null =>
  task.dueDate ? (task.startDate && task.startDate < task.dueDate ? task.startDate : task.dueDate) : null;

/** How many days before the due date a multi-day task starts (0 for a single day). */
export const taskSpanDays = (task: WhenColumns): number => {
  const first = taskFirstDay(task);
  return first && task.dueDate ? daysBetween(first, task.dueDate) : 0;
};

/**
 * The start date of a multi-day task whose due date moves to `dueDate` (snooze, next occurrence): the same number
 * of days before it. `null` for a single-day task.
 */
export function movedStartDate(task: WhenColumns, dueDate: string): string | null {
  const span = taskSpanDays(task);
  return span > 0 ? addDays(dueDate, -span) : null;
}

/** All-day tasks (one or several days) remind relative to this time on their (first) day. */
export const ALL_DAY_REMINDER_TIME = "09:00";

/**
 * Where a task's reminder counts back from: its time (a timeslot: the start) on the due date, or 09:00 on the
 * (first) day of an all-day task. `null` without a date.
 */
export function reminderAnchor(task: WhenColumns): { date: string; time: string } | null {
  const date = taskFirstDay(task);
  if (!date) return null;
  return { date, time: taskWhenKind(task) === "moment" || taskWhenKind(task) === "slot" ? (task.dueTime as string) : ALL_DAY_REMINDER_TIME };
}

/**
 * Reminder choices in the form, in minutes before the start (0 = at the start). Timed tasks count back from
 * their time; all-day tasks from 09:00 on their (first) day, so they get their own, coarser choices. A reminder
 * needs a due date; it is pushed to the assignees (or the creator when nobody is assigned), also during quiet
 * hours, because the person chose that moment (src/api/tasks/task-reminders.ts). All-day tasks never get one
 * automatically: only when chosen.
 */
export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;
/** For all-day tasks: on the day at 09:00, or 1 day, 2 days, a week before at 09:00. */
export const ALL_DAY_REMINDER_PRESETS = [0, 1440, 2880, 10_080] as const;
/** Longest "minutes before" we accept: one week. */
export const MAX_REMINDER_MINUTES = 10_080;

/**
 * The wall-clock moment of a reminder `minutes` before `dueDate` `dueTime`, as `{ date, time }` (both in the
 * household time zone). Pure date arithmetic, so the form and the API agree on what "30 min before" shows.
 * For a task, count back from `reminderAnchor(task)` (or use `taskReminderMoment`).
 */
export function reminderMoment(dueDate: string, dueTime: string, minutes: number): { date: string; time: string } {
  const total = Number(dueTime.slice(0, 2)) * 60 + Number(dueTime.slice(3, 5)) - minutes;
  const dayShift = Math.floor(total / 1440);
  const rest = total - dayShift * 1440;
  const pad = (value: number) => String(value).padStart(2, "0");
  return { date: addDays(dueDate, dayShift), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

/** The wall-clock moment of a task's reminder, or `null` without one (no date or no reminder). */
export function taskReminderMoment(task: WhenColumns & { reminderMinutes: number | null }): { date: string; time: string } | null {
  const anchor = reminderAnchor(task);
  if (!anchor || task.reminderMinutes === null || task.reminderMinutes === undefined) return null;
  return reminderMoment(anchor.date, anchor.time, task.reminderMinutes);
}

/** Tasks support the whole shared subset: every N days/weeks, weekdays, monthly, yearly, seasons. */
export const isTaskRRule = (rule: string) => isValidRRule(rule);

/**
 * The first due date of a repeating task asked to start on `date`: the first occurrence of the rule on or after
 * it, so "every Sunday" picked on a Thursday starts on Sunday. `date` itself when it matches or without a rule.
 */
export function firstDueDate(rrule: string | null | undefined, date: string): string {
  const rule = rrule ? parseRRule(rrule) : null;
  if (!rule) return date;
  return nextOccurrence(rule, date, date) ?? date;
}

export const checklistItemInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

/** Body of `POST /api/tasks` and `PUT /api/tasks/:id`. */
export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(2000).optional().nullable(),
    type: taskTypeSchema.default(DEFAULT_TASK_TYPE),
    placeId: idSchema.optional().nullable(),
    /** Ordered; with `rotateAssignees` the first one is on duty. */
    assigneeIds: z.array(idSchema).max(20).default([]),
    dueDate: isoDateSchema.optional().nullable(),
    priority: taskPrioritySchema.default("normal"),
    estimatedMinutes: z.coerce.number().int().min(1).max(10_080).optional().nullable(),
    /** RRULE without DTSTART; the due date is DTSTART. */
    rrule: z.string().trim().max(200).refine(isTaskRRule, { message: "invalidRecurrence" }).optional().nullable(),
    rotateAssignees: z.boolean().default(false),
    /** Time of day on the due date, `HH:MM`; needs a due date. Timed tasks sit at their hour in the calendar. */
    dueTime: dueTimeSchema.optional().nullable(),
    /** Timeslot: the end time on the due date, `HH:MM`, after `dueTime`. */
    endTime: dueTimeSchema.optional().nullable(),
    /** Several days: the first day (all-day), before `dueDate` (the last day). Equal to the due date = one day. */
    startDate: isoDateSchema.optional().nullable(),
    /**
     * Remind this many minutes before the start (0 = at the start); needs a due date. All-day tasks count back
     * from 09:00 on their (first) day. `null`: no reminder.
     */
    reminderMinutes: z.coerce.number().int().min(0).max(MAX_REMINDER_MINUTES).optional().nullable(),
    checklist: z.array(checklistItemInputSchema).max(MAX_CHECKLIST_ITEMS).default([]),
    /** The project (projects feature). Left out: an edit keeps the current project; `null` removes it. */
    projectId: idSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.rrule && !value.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "dueDateRequired" });
    }
    if (value.dueTime && !value.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "timeNeedsDate" });
    }
    if (value.reminderMinutes != null && !value.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "reminderNeedsDate" });
    }
    if (value.endTime && !value.dueTime) {
      ctx.addIssue({ code: "custom", path: ["dueTime"], message: "endTimeNeedsTime" });
    }
    if (value.endTime && value.dueTime && value.endTime <= value.dueTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "endTimeBeforeStart" });
    }
    if (value.startDate && !value.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "startDateNeedsDate" });
    }
    if (value.startDate && value.dueDate && value.startDate > value.dueDate) {
      ctx.addIssue({ code: "custom", path: ["startDate"], message: "startDateAfterEnd" });
    }
    if (value.startDate && value.dueDate && value.startDate < value.dueDate) {
      if (daysBetween(value.startDate, value.dueDate) > MAX_TASK_DAYS) {
        ctx.addIssue({ code: "custom", path: ["startDate"], message: "daysTooLong" });
      }
      if (value.dueTime) ctx.addIssue({ code: "custom", path: ["dueTime"], message: "daysAllDay" });
    }
    if (new Set(value.assigneeIds).size !== value.assigneeIds.length) {
      ctx.addIssue({ code: "custom", path: ["assigneeIds"], message: "unknownHabitant" });
    }
  });
export type TaskInput = z.infer<typeof taskInputSchema>;

/** `POST /api/tasks/:id/complete`. Who did it defaults to the logged-in user's habitant. */
export const taskCompleteInputSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  completedById: idSchema.optional().nullable(),
  /** "Complete anyway": also when tasks it waits for are still open (otherwise a 409 `blocked`). */
  force: z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).default(false),
});
export type TaskCompleteInput = z.infer<typeof taskCompleteInputSchema>;

/** `POST /api/tasks/:id/hold`: put on hold, with an optional reason. */
export const taskHoldInputSchema = z.object({ reason: z.string().trim().max(300).optional().nullable() });
export type TaskHoldInput = z.infer<typeof taskHoldInputSchema>;

/** `POST /api/tasks/:id/comments` and `PUT /api/tasks/:id/comments/:commentId`. */
export const taskCommentInputSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export type TaskCommentInput = z.infer<typeof taskCommentInputSchema>;

/**
 * How a task relates to another, seen from the task: it waits for the other (`blocked_by`), the other waits
 * for it (`blocks`), or they're just related.
 */
export const TASK_LINK_KINDS = ["blocked_by", "blocks", "related"] as const;
export const taskLinkKindSchema = z.enum(TASK_LINK_KINDS);
export type TaskLinkKind = z.infer<typeof taskLinkKindSchema>;

/** `POST /api/tasks/:id/links`. */
export const taskLinkInputSchema = z.object({ otherTaskId: idSchema, kind: taskLinkKindSchema });
export type TaskLinkInput = z.infer<typeof taskLinkInputSchema>;

/** `GET /api/tasks/linked?originType=&originId=`: the linked task of another feature's record. */
export const linkedTaskQuerySchema = z.object({ originType: z.string().trim().min(1).max(40), originId: z.string().trim().min(1).max(200) });
export type LinkedTaskQuery = z.infer<typeof linkedTaskQuerySchema>;

/** `GET /api/tasks/linked/holds?originType=`: which records' linked tasks are on hold. */
export const linkedHoldsQuerySchema = z.object({ originType: z.string().trim().min(1).max(40) });

/** Origin id → hold reason (`null` without one), for linked tasks on hold. */
export type LinkedHolds = Record<string, string | null>;

/** `POST /api/tasks/:id/skip`. */
export const taskSkipInputSchema = z.object({ note: z.string().trim().max(500).optional().nullable() });
export type TaskSkipInput = z.infer<typeof taskSkipInputSchema>;

/** `POST /api/tasks/:id/snooze`: the new due date (today or later). */
export const taskSnoozeInputSchema = z.object({ until: isoDateSchema });
export type TaskSnoozeInput = z.infer<typeof taskSnoozeInputSchema>;

/** `PUT /api/tasks/:id/checklist/:itemId`. */
export const checklistToggleInputSchema = z.object({ done: z.boolean() });
export type ChecklistToggleInput = z.infer<typeof checklistToggleInputSchema>;

/**
 * `GET /api/tasks?placeId=`: only the tasks of one place. `?projectId=`: only the tasks of one project (then
 * closed tasks of any age are included, so the project shows its whole progress).
 */
export const tasksQuerySchema = z.object({ placeId: idSchema.optional(), projectId: idSchema.optional() });
export type TasksQuery = z.infer<typeof tasksQuerySchema>;

// ── Read models ───────────────────────────────────────────────────────────────────────────────────────

/** The task's place with its floor, enough to group by floor and to show a `PlaceBadge`. */
export type TaskPlace = {
  id: string;
  name: string;
  kind: "room" | "zone";
  color: string;
  icon: string | null;
  floorId: string;
  floorName: string;
  /** Floor ordering: 0 = ground floor, 1 = first floor, -1 = basement. */
  floorLevel: number;
};

export type TaskChecklistItem = { id: string; label: string; done: boolean };

/** Materials are shopping items linked to the task (shopping feature): how many, and how many bought. */
export type TaskMaterials = { total: number; bought: number };

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  type: TaskType;
  /** Optional for every type; when set, it tells inside or outside. */
  place: TaskPlace | null;
  /** Ordered; with `rotateAssignees` the first one is on duty this time. */
  assigneeIds: string[];
  rotateAssignees: boolean;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  status: TaskStatus;
  /** `YYYY-MM-DD`, or `null` for "whenever". */
  dueDate: string | null;
  rrule: string | null;
  /** DTSTART of the RRULE, `YYYY-MM-DD`. */
  recurrenceStart: string | null;
  checklist: TaskChecklistItem[];
  /** `null` when the task needs no materials. */
  materials: TaskMaterials | null;
  readiness: TaskReadiness;
  /** ISO timestamp, when done/skipped. */
  closedAt: string | null;
  /** Optional time of day on the due date, `HH:MM`; with `endTime` the start of a timeslot. */
  dueTime: string | null;
  /** Timeslot: the end time on the due date, `HH:MM`; `null` for a moment or all day. */
  endTime: string | null;
  /** Several days: the first day, `YYYY-MM-DD` (all-day; `dueDate` is the last day); `null` for one day. */
  startDate: string | null;
  /** Reminder minutes before the start (0 = at the start; all-day: before 09:00 on the first day), or `null`. */
  reminderMinutes: number | null;
  /** ISO timestamp of the current occurrence's reminder, or `null`. */
  remindAt: string | null;
  /** ISO timestamp: when that reminder was sent (or skipped after downtime); `null` while it is still to come. */
  remindedAt: string | null;
  /** Set when another feature keeps this task in sync (a linked task); `null` for normal tasks. */
  origin: TaskOrigin | null;
  /** On hold (visibly blocked, due date and overdue state unchanged); `null` when not. */
  hold: TaskHold | null;
  /** Open tasks this one waits for: it can't be completed until they're done (or "complete anyway"). */
  waitingFor: TaskRef[];
  commentCount: number;
  /** The project it is part of (projects feature), or `null`. */
  project: ProjectRef | null;
};

export type TaskHold = {
  /** ISO timestamp */
  since: string;
  reason: string | null;
};

/** Another task, as far as a link needs to show it. */
export type TaskRef = { id: string; title: string; status: TaskStatus; dueDate: string | null };

/** A task's links: what it waits for (open and done), what waits for it, and plain related tasks. */
export type TaskLinks = { blockedBy: TaskRef[]; blocks: TaskRef[]; related: TaskRef[] };

export type TaskComment = {
  id: string;
  body: string;
  /** The account that wrote it; `null` when that account was removed. */
  authorId: string | null;
  authorName: string | null;
  /** The author's habitant, for the avatar. */
  authorHabitantId: string | null;
  /** ISO timestamps */
  createdAt: string;
  editedAt: string | null;
  /** The logged-in user wrote it: they may edit and delete it. */
  mine: boolean;
};

/** `POST /api/tasks/:id/complete`: the task after completing, and tasks that no longer wait for anything. */
export type TaskCompleteResult = Task & { unblocked: TaskRef[] };

/**
 * Where a linked task comes from: another feature created it through `upsertLinkedTask`
 * (src/api/tasks/linked-tasks.ts), e.g. the bins for a waste collection day. Its title, type and due date
 * follow the origin; people only complete it, assign it and add notes.
 */
export type TaskOrigin = {
  /** The origin feature, e.g. `"waste"` or `"expense"`; the label is `tasks:origin.<type>`. */
  type: string;
  /** The origin's own key (a collection day, an expense instance id). */
  id: string;
  /** The origin's date (collection day, due date), `YYYY-MM-DD`. */
  date: string | null;
  /** Link back to the origin, e.g. `/settings#waste`. */
  href: string | null;
};

/** A task (or one occurrence of a recurring task) closed today, so lists can show today's progress. */
export type TaskCompletedToday = {
  completionId: string;
  taskId: string;
  outcome: TaskOutcome;
  /** The due date of the occurrence that was closed. */
  occurrenceDate: string | null;
  /** ISO timestamp */
  completedAt: string;
  completedById: string | null;
};

export type TaskCompletion = {
  id: string;
  outcome: TaskOutcome;
  /** The due date of the occurrence that was completed. */
  occurrenceDate: string | null;
  /** ISO timestamp */
  completedAt: string;
  completedById: string | null;
  note: string | null;
};

/** Who is looking, so self-loading sections (e.g. on a place page) know which actions to offer. */
export type TaskViewer = { habitantId: string | null; canManage: boolean };

export type TasksOverview = {
  /** Today in the household time zone: the reference for overdue and due labels. */
  today: string;
  viewer: TaskViewer;
  /** Open tasks plus tasks closed in the last `CLOSED_TASKS_DAYS` days. */
  tasks: Task[];
  /**
   * Everything closed today (one-off tasks and occurrences of recurring ones), newest first. Each refers to
   * a task in `tasks`; lists keep these visible, struck through, until tomorrow.
   */
  completedToday: TaskCompletedToday[];
};

export type TaskDetail = {
  today: string;
  viewer: TaskViewer;
  task: Task;
  /** Completion history, newest first. */
  history: TaskCompletion[];
  /** Recurring: the next few due dates after the current one. */
  upcoming: string[];
  links: TaskLinks;
  /** Oldest first. */
  comments: TaskComment[];
};

/** `GET /api/tasks/summary`: for the dashboard. Counts are open tasks. */
export type TasksSummary = {
  today: string;
  open: number;
  overdue: number;
  dueToday: number;
  ready: number;
  waiting: number;
  /** On duty for the logged-in user's habitant. */
  mine: number;
  /** Tasks and occurrences closed today (done or skipped): "3 of 5 done today" is `doneToday` of `doneToday + overdue + dueToday`. */
  doneToday: number;
  /** Overdue, today and the coming week, most urgent first (at most 5). */
  upcoming: Task[];
};

// ── Pure helpers (shared by API and UI) ───────────────────────────────────────────────────────────────

/**
 * Readiness from status and materials. The single place that decides it: tasks without materials are
 * ready; with materials, ready once everything is bought.
 */
export function taskReadiness(task: { status: TaskStatus; materials: TaskMaterials | null }): TaskReadiness {
  if (task.status !== "open") return "done";
  if (task.materials && task.materials.total > 0 && task.materials.bought < task.materials.total) return "waiting";
  return "ready";
}

export const isOverdue = (task: Pick<Task, "status" | "dueDate">, today: string) =>
  task.status === "open" && task.dueDate !== null && task.dueDate < today;

export type DueState = "overdue" | "today" | "soon" | "later" | "none";

/** How urgent the due date is: overdue, today, within a week, later, or no date. */
export function dueState(task: Pick<Task, "status" | "dueDate">, today: string): DueState {
  if (!task.dueDate) return "none";
  if (isOverdue(task, today)) return "overdue";
  if (task.dueDate === today) return "today";
  return task.dueDate <= addDays(today, 7) ? "soon" : "later";
}

/** Inside or outside from the place; `null` without a place. For display and filtering only. */
export const taskLocation = (task: Pick<Task, "place">): TaskLocation | null =>
  task.place ? (task.place.kind === "zone" ? "outside" : "inside") : null;

/** Who has to do it this time: everyone assigned, or only the first when the task rotates. */
export const onDutyIds = (task: Pick<Task, "assigneeIds" | "rotateAssignees">): string[] =>
  task.rotateAssignees ? task.assigneeIds.slice(0, 1) : task.assigneeIds;

/** Adults manage everything; children may complete (and tick off) tasks assigned to them. */
export function canCompleteTask(task: Pick<Task, "assigneeIds">, viewer: TaskViewer): boolean {
  return viewer.canManage || (viewer.habitantId !== null && task.assigneeIds.includes(viewer.habitantId));
}

/** Rotation: the one on duty moves to the back. */
export const rotateAssignees = (ids: string[]): string[] => (ids.length > 1 ? [...ids.slice(1), ...ids.slice(0, 1)] : ids);

/**
 * The next due date of a recurring task after the current occurrence is done or skipped: the first
 * occurrence after both the current one and today, so a task completed late doesn't come back overdue.
 * `null` for one-off tasks and when the series has ended.
 */
export function nextDueDate(
  task: { rrule: string | null; recurrenceStart: string | null; occurrenceDate: string | null },
  today: string,
): string | null {
  const rule = task.rrule ? parseRRule(task.rrule) : null;
  if (!rule || !task.recurrenceStart) return null;
  const current = task.occurrenceDate ?? task.recurrenceStart;
  const after = current > today ? current : today;
  return nextOccurrence(rule, task.recurrenceStart, addDays(after, 1));
}

/** The next `count` due dates after `after` (exclusive), for previews. */
export function upcomingDueDates(task: { rrule: string | null; recurrenceStart: string | null }, after: string, count = 3): string[] {
  const rule = task.rrule ? parseRRule(task.rrule) : null;
  if (!rule || !task.recurrenceStart) return [];
  return expandRRule(rule, task.recurrenceStart, { from: addDays(after, 1), to: addDays(after, 3660), limit: count });
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** Most urgent first: by due date (no date last), then priority, then title. */
export function compareTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  // Same day: timed tasks by time, before the ones without a time.
  if ((a.dueTime ?? null) !== (b.dueTime ?? null)) {
    if (!a.dueTime) return 1;
    if (!b.dueTime) return -1;
    return a.dueTime.localeCompare(b.dueTime);
  }
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title);
}

export const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

/** A linked task follows another feature: only done, assignees and notes are editable. */
export const isLinkedTask = (task: Pick<Task, "origin">): boolean => task.origin !== null;

/** Waits for open tasks: completing it needs "complete anyway". */
export const isWaiting = (task: Pick<Task, "status" | "waitingFor">): boolean => task.status === "open" && task.waitingFor.length > 0;

/**
 * Whether "`taskId` waits for `blockerId`" would close a loop: it does when `blockerId` already waits,
 * directly or through other tasks, for `taskId` (or they are the same task). `edges` are the existing
 * BLOCKED_BY links as `[waiting task, the task it waits for]`.
 */
export function wouldCreateCycle(edges: readonly (readonly [string, string])[], taskId: string, blockerId: string): boolean {
  if (taskId === blockerId) return true;
  const waitsFor = new Map<string, string[]>();
  for (const [from, to] of edges) waitsFor.set(from, [...(waitsFor.get(from) ?? []), to]);
  const seen = new Set<string>();
  const stack = [blockerId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(waitsFor.get(current) ?? []));
  }
  return false;
}

/** Adults and owners create and change tasks. Mirrors the API's role check. */
export const canManageTasks = canManageHousehold;
