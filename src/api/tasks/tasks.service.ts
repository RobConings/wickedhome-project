import type { SessionUser } from "@/features/auth/types/auth";
import { zonedToUtc } from "@/features/calendar/types/calendar-time";
import {
  CLOSED_TASKS_DAYS,
  compareTasks,
  dueState,
  firstDueDate,
  movedStartDate,
  nextDueDate,
  onDutyIds,
  rotateAssignees,
  upcomingDueDates,
  type ChecklistToggleInput,
  type Task,
  type TaskCompleteInput,
  type TaskCompleteResult,
  type TaskCompletedToday,
  type TaskCompletion,
  type TaskDetail,
  type TaskHoldInput,
  type TaskInput,
  type TaskOutcome,
  type TaskRef,
  type TaskSkipInput,
  type TaskSnoozeInput,
  type TasksOverview,
  type TasksQuery,
  type TasksSummary,
  type TaskViewer,
} from "@/features/tasks/types/tasks";
import { addDays, todayIn } from "@/types/dates";
import { forgetDocumentLinks } from "../documents/documents.service";
import { db, type Prisma, type TaskPriority as TaskPriorityRow, type TaskType as TaskTypeRow } from "../lib/db";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/http";
import { loadTaskComments } from "./task-comments";
import { loadTaskLinks } from "./task-links";
import { notifyLinkedTaskClosed, notifyLinkedTaskReopened } from "./linked-task-handlers";
import { deleteTaskMaterials } from "./task-materials";
import { notifyUnblocked } from "./task-notifications";
import { reminderColumns } from "./task-reminders";
import {
  findOwnTask,
  optionalDate,
  taskInclude,
  taskRefSelect,
  toDate,
  toOneTask,
  toTaskRef,
  toTasks,
  type TaskRow,
} from "./task-rows";

/*
 * Recurring tasks
 * ───────────────
 * A recurring task is ONE row that moves forward, not a series of materialised instances: chores have
 * no per-instance data worth keeping apart from "who did it, when", which goes into TaskCompletion.
 *
 * - `rrule` + `recurrenceStart` (DTSTART) define the schedule; `occurrenceDate` is the scheduled date of
 *   the current occurrence and `dueDate` the date it should be done (equal, unless snoozed).
 * - Completing or skipping records a TaskCompletion and moves the task to `nextDueDate()`: the first
 *   occurrence after both the current one and today (late completions don't produce a backlog). The
 *   checklist is reset and, with rotation, the one on duty moves to the back of the assignees.
 * - When the series has ended (COUNT/UNTIL), the task closes as done/skipped like a one-off task.
 * - The "when" repeats with it: the time, the timeslot (`dueTime`–`endTime`) and, for a task over several days,
 *   the number of days (`startDate` moves along with `dueDate`, see `movedStartDate`). The reminder is recomputed
 *   for every occurrence.
 * - A new rule (or a new first date) starts on the rule's first day on or after the chosen date
 *   (`firstDueDate`): "every Sunday" added on a Thursday is first due on Sunday.
 *
 * Linked tasks (origin set, see linked-tasks.ts) follow another feature: the form only changes their
 * assignees and notes, they can't be deleted by hand (skip them instead), and closing or reopening them
 * tells the origin (linked-task-handlers.ts).
 */

const HISTORY_LIMIT = 50;
const SUMMARY_UPCOMING = 5;

type CompletionRow = Prisma.TaskCompletionGetPayload<object>;

const lower = <T extends string>(value: string) => value.toLowerCase() as T;
const today = () => todayIn();

const toCompletion = (row: CompletionRow): TaskCompletion => ({
  id: row.id,
  outcome: lower<TaskOutcome>(row.outcome),
  occurrenceDate: optionalDate(row.occurrenceDate),
  completedAt: row.completedAt.toISOString(),
  completedById: row.completedById,
  note: row.note,
});

const viewerOf = (user: SessionUser): TaskViewer => ({ habitantId: user.habitantId, canManage: user.role !== "child" });

/** Children may only act on tasks assigned to them. */
function assertCanComplete(user: SessionUser, row: TaskRow) {
  if (user.role !== "child") return;
  if (!user.habitantId || !row.assignees.some((assignee) => assignee.habitantId === user.habitantId)) {
    throw forbidden("Only tasks assigned to you");
  }
}

async function assertOwnReferences(householdId: string, input: Pick<TaskInput, "placeId" | "assigneeIds" | "projectId">) {
  if (input.placeId) {
    const place = await db.place.count({ where: { id: input.placeId, householdId } });
    if (!place) throw badRequest("Validation failed", { placeId: ["unknownPlace"] });
  }
  if (input.projectId) {
    const project = await db.project.count({ where: { id: input.projectId, householdId } });
    if (!project) throw badRequest("Validation failed", { projectId: ["unknownProject"] });
  }
  if (input.assigneeIds.length > 0) {
    const found = await db.habitant.count({ where: { householdId, id: { in: input.assigneeIds } } });
    if (found !== input.assigneeIds.length) throw badRequest("Validation failed", { assigneeIds: ["unknownHabitant"] });
  }
}

async function assertOwnHabitant(householdId: string, id: string | null | undefined, field: string) {
  if (!id) return;
  const found = await db.habitant.count({ where: { householdId, id } });
  if (!found) throw badRequest("Validation failed", { [field]: ["unknownHabitant"] });
}

/** Start of today in the household time zone, as an instant: "closed today" means at or after it. */
const startOfToday = (date: string) => zonedToUtc(date, "00:00");

async function completedTodayOf(householdId: string, date: string): Promise<TaskCompletedToday[]> {
  const rows = await db.taskCompletion.findMany({
    where: { task: { householdId }, completedAt: { gte: startOfToday(date) } },
    orderBy: { completedAt: "desc" },
  });
  return rows.map((row) => ({
    completionId: row.id,
    taskId: row.taskId,
    outcome: lower<TaskOutcome>(row.outcome),
    occurrenceDate: optionalDate(row.occurrenceDate),
    completedAt: row.completedAt.toISOString(),
    completedById: row.completedById,
  }));
}

// ── Queries ───────────────────────────────────────────────────────────────────────────────────────────

export async function getTasksOverview(user: SessionUser, query: TasksQuery = {}): Promise<TasksOverview> {
  const now = today();
  const closedSince = new Date(`${addDays(now, -CLOSED_TASKS_DAYS)}T00:00:00Z`);
  const [rows, completedToday] = await Promise.all([
    db.task.findMany({
      where: {
        householdId: user.householdId,
        ...(query.placeId && { placeId: query.placeId }),
        // A project shows all of its tasks; elsewhere closed ones only for a while.
        ...(query.projectId ? { projectId: query.projectId } : { OR: [{ status: "OPEN" as const }, { closedAt: { gte: closedSince } }] }),
      },
      include: taskInclude,
    }),
    completedTodayOf(user.householdId, now),
  ]);
  const tasks = await toTasks(user.householdId, rows);
  const ids = new Set(tasks.map((task) => task.id));
  return {
    today: now,
    viewer: viewerOf(user),
    tasks: tasks.sort(compareTasks),
    completedToday: completedToday.filter((completion) => ids.has(completion.taskId)),
  };
}

async function detailOf(user: SessionUser, row: TaskRow): Promise<TaskDetail> {
  const now = today();
  const [task, history, links, comments] = await Promise.all([
    toOneTask(user.householdId, row),
    db.taskCompletion.findMany({ where: { taskId: row.id }, orderBy: { completedAt: "desc" }, take: HISTORY_LIMIT }),
    loadTaskLinks(row.id),
    loadTaskComments(user, row.id),
  ]);
  const current = optionalDate(row.occurrenceDate) ?? task.dueDate;
  return {
    today: now,
    viewer: viewerOf(user),
    task,
    history: history.map(toCompletion),
    upcoming: task.status === "open" && current ? upcomingDueDates(task, current) : [],
    links,
    comments,
  };
}

export async function getTaskDetail(user: SessionUser, id: string): Promise<TaskDetail> {
  return detailOf(user, await findOwnTask(user.householdId, id));
}

/** The task another feature linked to one of its records (e.g. an expense's pay task), or `null`. */
export async function getLinkedTaskDetail(user: SessionUser, originType: string, originId: string): Promise<TaskDetail | null> {
  const row = await db.task.findFirst({ where: { householdId: user.householdId, originType, originId }, include: taskInclude });
  return row ? detailOf(user, row) : null;
}

/** Linked tasks of one origin type that are on hold: origin id → reason (`null` without one). For the origin's lists. */
export async function getLinkedHolds(user: SessionUser, originType: string): Promise<Record<string, string | null>> {
  const rows = await db.task.findMany({
    where: { householdId: user.householdId, originType, status: "OPEN", heldAt: { not: null } },
    select: { originId: true, holdReason: true },
  });
  return Object.fromEntries(rows.flatMap((row) => (row.originId ? [[row.originId, row.holdReason]] : [])));
}

export async function getTasksSummary(user: SessionUser): Promise<TasksSummary> {
  const now = today();
  const [rows, doneToday] = await Promise.all([
    db.task.findMany({ where: { householdId: user.householdId, status: "OPEN" }, include: taskInclude }),
    db.taskCompletion.count({ where: { task: { householdId: user.householdId }, completedAt: { gte: startOfToday(now) } } }),
  ]);
  const tasks = (await toTasks(user.householdId, rows)).sort(compareTasks);
  const states = tasks.map((task) => ({ task, due: dueState(task, now) }));
  return {
    today: now,
    open: tasks.length,
    overdue: states.filter(({ due }) => due === "overdue").length,
    dueToday: states.filter(({ due }) => due === "today").length,
    ready: tasks.filter((task) => task.readiness === "ready").length,
    waiting: tasks.filter((task) => task.readiness === "waiting").length,
    mine: user.habitantId ? tasks.filter((task) => onDutyIds(task).includes(user.habitantId ?? "")).length : 0,
    doneToday,
    upcoming: states
      .filter(({ due }) => due === "overdue" || due === "today" || due === "soon")
      .slice(0, SUMMARY_UPCOMING)
      .map(({ task }) => task),
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────────────────────────────

const assigneesCreate = (ids: string[]) => ({ create: ids.map((habitantId, position) => ({ habitantId, position })) });
const checklistCreate = (items: TaskInput["checklist"]) => ({
  create: items.map((item, position) => ({ label: item.label, done: item.done, position })),
});

/** Columns that come straight from the form. */
function fieldsOf(input: TaskInput) {
  const multiDay = Boolean(input.dueDate && input.startDate && input.startDate < input.dueDate);
  // A time only means something on one date, an end time only after a start time, a reminder only with a date.
  const dueTime = input.dueDate && !multiDay ? (input.dueTime ?? null) : null;
  return {
    title: input.title,
    notes: input.notes || null,
    type: input.type.toUpperCase() as TaskTypeRow,
    placeId: input.placeId || null,
    priority: input.priority.toUpperCase() as TaskPriorityRow,
    estimatedMinutes: input.estimatedMinutes ?? null,
    dueDate: input.dueDate ? toDate(input.dueDate) : null,
    dueTime,
    endTime: dueTime ? (input.endTime ?? null) : null,
    startDate: multiDay && input.startDate ? toDate(input.startDate) : null,
    reminderMinutes: input.dueDate ? (input.reminderMinutes ?? null) : null,
    rrule: input.rrule || null,
    // Rotation only means something for a recurring task with several people.
    rotateAssignees: Boolean(input.rrule) && input.rotateAssignees && input.assigneeIds.length > 1,
    // Left out (undefined): an edit keeps the project; null removes it.
    ...(input.projectId !== undefined && { projectId: input.projectId || null }),
  };
}

/** The reminder columns for the form's values (see task-reminders.ts). */
const reminderOf = (fields: ReturnType<typeof fieldsOf>, current?: { remindAt: Date | null }) =>
  reminderColumns(
    {
      dueDate: optionalDate(fields.dueDate),
      dueTime: fields.dueTime,
      startDate: optionalDate(fields.startDate),
      reminderMinutes: fields.reminderMinutes,
    },
    current,
  );

/**
 * A repeating task starts on the rule's first day on or after the chosen due date ("every Sunday" picked on a
 * Thursday: Sunday); a multi-day task's first day moves along by the same number of days.
 */
function alignedToRule(input: TaskInput): TaskInput {
  if (!input.rrule || !input.dueDate) return input;
  const dueDate = firstDueDate(input.rrule, input.dueDate);
  if (dueDate === input.dueDate) return input;
  return { ...input, dueDate, startDate: input.startDate ? movedStartDate(input, dueDate) : input.startDate };
}

/** `createdById`: the account that adds it (gets its reminder when nobody is assigned). */
export async function createTask(householdId: string, asked: TaskInput, { createdById = null }: { createdById?: string | null } = {}): Promise<Task> {
  await assertOwnReferences(householdId, asked);
  const input = alignedToRule(asked);
  const recurring = Boolean(input.rrule && input.dueDate);
  const fields = fieldsOf(input);
  const row = await db.task.create({
    data: {
      householdId,
      ...fields,
      ...reminderOf(fields),
      createdById,
      recurrenceStart: recurring && input.dueDate ? toDate(input.dueDate) : null,
      occurrenceDate: recurring && input.dueDate ? toDate(input.dueDate) : null,
      assignees: assigneesCreate(input.assigneeIds),
      checklist: checklistCreate(input.checklist),
    },
    include: taskInclude,
  });
  return toOneTask(householdId, row);
}

/**
 * Edits a task. Changing the repeat rule or the due date of a recurring task restarts its schedule from
 * the (new) due date; otherwise the schedule and the snoozed state stay as they are. A linked task only
 * takes the assignees and notes: the rest belongs to its origin.
 */
export async function updateTask(householdId: string, id: string, asked: TaskInput): Promise<Task> {
  const existing = await findOwnTask(householdId, id);
  await assertOwnReferences(householdId, {
    placeId: existing.originType ? null : asked.placeId,
    assigneeIds: asked.assigneeIds,
    projectId: asked.projectId,
  });
  // A new rule or a new first date starts on the rule's first day; a snoozed due date that stays is left alone.
  const restarts = (existing.rrule ?? null) !== (asked.rrule || null) || optionalDate(existing.dueDate) !== (asked.dueDate ?? null);
  const input = restarts ? alignedToRule(asked) : asked;

  if (existing.originType) {
    const row = await db.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      return tx.task.update({
        where: { id },
        data: {
          notes: input.notes || null,
          assignees: assigneesCreate(input.assigneeIds),
          ...(input.projectId !== undefined && { projectId: input.projectId || null }),
        },
        include: taskInclude,
      });
    });
    return toOneTask(householdId, row);
  }

  const fields = fieldsOf(input);
  const scheduleChanged =
    (existing.rrule ?? null) !== fields.rrule || optionalDate(existing.dueDate) !== (input.dueDate ?? null);
  const schedule = !fields.rrule
    ? { recurrenceStart: null, occurrenceDate: null }
    : scheduleChanged
      ? { recurrenceStart: fields.dueDate, occurrenceDate: fields.dueDate }
      : {};

  const row = await db.$transaction(async (tx) => {
    await tx.taskAssignee.deleteMany({ where: { taskId: id } });
    await tx.taskChecklistItem.deleteMany({ where: { taskId: id } });
    return tx.task.update({
      where: { id },
      data: {
        ...fields,
        ...schedule,
        ...reminderOf(fields, existing),
        assignees: assigneesCreate(input.assigneeIds),
        checklist: checklistCreate(input.checklist),
      },
      include: taskInclude,
    });
  });
  return toOneTask(householdId, row);
}

/** Deletes a task with its materials and document links. Used by `deleteTask` and for linked tasks. */
export async function deleteTaskRow(householdId: string, id: string): Promise<void> {
  await db.task.delete({ where: { id } });
  await deleteTaskMaterials(householdId, id);
  await forgetDocumentLinks("task", id);
}

export async function deleteTask(householdId: string, id: string): Promise<void> {
  const row = await findOwnTask(householdId, id);
  // Its origin would bring it back; skipping closes it for good.
  if (row.originType) throw conflict("A linked task can't be deleted; skip it instead");
  await deleteTaskRow(householdId, id);
}

/**
 * The columns that move along when a task's due date moves to `dueDate` (snooze, next occurrence): the first day
 * of a multi-day task (same number of days) and the reminder. Times and the timeslot stay as they are.
 */
function movedWhen(row: TaskRow, dueDate: string, current?: { remindAt: Date | null }) {
  const when = { dueDate: optionalDate(row.dueDate), dueTime: row.dueTime, endTime: row.endTime, startDate: optionalDate(row.startDate) };
  const startDate = movedStartDate(when, dueDate);
  return {
    startDate: startDate ? toDate(startDate) : null,
    ...reminderColumns({ dueDate, dueTime: row.dueTime, startDate, reminderMinutes: row.reminderMinutes }, current),
  };
}

type CloseOptions = {
  note?: string | null;
  completedById?: string | null;
  /** Tell the origin feature (off when the origin itself closes its task). */
  notifyOrigin?: boolean;
  actorUserId?: string | null;
};

/** Open tasks that waited only for `blockerId` (now closed): they can be done now. */
async function unblockedBy(blockerId: string): Promise<TaskRef[]> {
  const waiting = await db.task.findMany({
    where: { status: "OPEN", links: { some: { otherTaskId: blockerId, kind: "BLOCKED_BY" } } },
    select: { ...taskRefSelect, links: { where: { kind: "BLOCKED_BY", otherTask: { status: "OPEN" } }, select: { otherTaskId: true } } },
  });
  return waiting.filter((task) => task.links.length === 0).map(toTaskRef);
}

/**
 * Done or skipped: records the completion, then moves a recurring task to its next occurrence or closes
 * the task (one-off, or the series has ended). Returns the task and what no longer waits for it.
 */
export async function closeTaskOccurrence(
  householdId: string,
  id: string,
  outcome: TaskOutcome,
  { note, completedById, notifyOrigin = true, actorUserId = null }: CloseOptions,
): Promise<TaskCompleteResult> {
  const row = await findOwnTask(householdId, id);
  if (row.status !== "OPEN") throw conflict("This task is already closed");
  const now = today();
  const occurrence = row.occurrenceDate ?? row.dueDate;
  const next = nextDueDate(
    { rrule: row.rrule, recurrenceStart: optionalDate(row.recurrenceStart), occurrenceDate: optionalDate(occurrence) },
    now,
  );

  const updated = await db.$transaction(async (tx) => {
    await tx.taskCompletion.create({
      data: { taskId: id, outcome: outcome === "done" ? "DONE" : "SKIPPED", occurrenceDate: occurrence, completedById, note: note || null },
    });
    if (!next) {
      return tx.task.update({
        where: { id },
        // Closing ends a hold: there's nothing left to wait for.
        data: { status: outcome === "done" ? "DONE" : "SKIPPED", closedAt: new Date(), heldAt: null, holdReason: null },
        include: taskInclude,
      });
    }
    await tx.taskChecklistItem.updateMany({ where: { taskId: id }, data: { done: false } });
    if (row.rotateAssignees && row.assignees.length > 1) {
      const order = rotateAssignees(row.assignees.map((assignee) => assignee.habitantId));
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      await tx.taskAssignee.createMany({ data: order.map((habitantId, position) => ({ taskId: id, habitantId, position })) });
    }
    return tx.task.update({
      where: { id },
      // The next occurrence keeps the time, the timeslot and the number of days, and gets its own reminder.
      data: { dueDate: toDate(next), occurrenceDate: toDate(next), ...movedWhen(row, next) },
      include: taskInclude,
    });
  });
  const [task, unblocked] = await Promise.all([toOneTask(householdId, updated), next ? Promise.resolve([]) : unblockedBy(id)]);
  if (notifyOrigin && row.originType && row.originId) {
    await notifyLinkedTaskClosed(row.originType, {
      householdId,
      taskId: id,
      originId: row.originId,
      actorUserId,
      outcome,
      completedById: completedById ?? null,
    });
  }
  // "Can start now: …" for what waited only for this one (docs/NOTIFICATIONS.md); doesn't wait for the push.
  notifyUnblocked(householdId, row.title, unblocked, actorUserId);
  return { ...task, unblocked };
}

/** Children complete their own tasks, as themselves; adults may record someone else. */
export async function completeTask(user: SessionUser, id: string, input: TaskCompleteInput): Promise<TaskCompleteResult> {
  const row = await findOwnTask(user.householdId, id);
  assertCanComplete(user, row);
  if (row.status === "OPEN" && row.links.length > 0 && !input.force) {
    throw new HttpError(409, "blocked", `Waiting for: ${row.links.map((link) => link.otherTask.title).join(", ")}`);
  }
  const completedById = user.role === "child" ? user.habitantId : (input.completedById ?? user.habitantId);
  await assertOwnHabitant(user.householdId, completedById, "completedById");
  return closeTaskOccurrence(user.householdId, id, "done", { note: input.note, completedById, actorUserId: user.id });
}

export async function skipTask(user: SessionUser, id: string, input: TaskSkipInput): Promise<Task> {
  return closeTaskOccurrence(user.householdId, id, "skipped", { note: input.note, completedById: user.habitantId, actorUserId: user.id });
}

/** Moves the due date of the current occurrence; the schedule itself is unchanged. */
export async function snoozeTask(user: SessionUser, id: string, input: TaskSnoozeInput): Promise<Task> {
  const row = await findOwnTask(user.householdId, id);
  if (row.status !== "OPEN") throw conflict("This task is already closed");
  if (input.until < today()) throw badRequest("Validation failed", { until: ["Choose today or a later date"] });
  const updated = await db.task.update({
    where: { id },
    // A multi-day task keeps its number of days; the reminder moves along with the date (same time of day).
    data: { dueDate: toDate(input.until), ...movedWhen(row, input.until, row) },
    include: taskInclude,
  });
  return toOneTask(user.householdId, updated);
}

/** Opens a closed task again and removes the completion that closed it. */
export async function reopenTaskRow(
  householdId: string,
  id: string,
  { notifyOrigin = true, actorUserId = null }: { notifyOrigin?: boolean; actorUserId?: string | null } = {},
): Promise<Task> {
  const row = await findOwnTask(householdId, id);
  if (row.status === "OPEN") return toOneTask(householdId, row);
  const updated = await db.$transaction(async (tx) => {
    const last = await tx.taskCompletion.findFirst({ where: { taskId: id }, orderBy: { completedAt: "desc" } });
    if (last) await tx.taskCompletion.delete({ where: { id: last.id } });
    return tx.task.update({ where: { id }, data: { status: "OPEN", closedAt: null }, include: taskInclude });
  });
  if (notifyOrigin && row.originType && row.originId) {
    await notifyLinkedTaskReopened(row.originType, { householdId, taskId: id, originId: row.originId, actorUserId });
  }
  return toOneTask(householdId, updated);
}

/** Undoes closing a task. */
export async function reopenTask(user: SessionUser, id: string): Promise<Task> {
  return reopenTaskRow(user.householdId, id, { actorUserId: user.id });
}

/** On hold: visibly blocked with an optional reason; the due date (and overdue state) stays. */
export async function holdTask(user: SessionUser, id: string, input: TaskHoldInput): Promise<Task> {
  const row = await findOwnTask(user.householdId, id);
  if (row.status !== "OPEN") throw conflict("This task is already closed");
  const updated = await db.task.update({
    where: { id },
    data: { heldAt: row.heldAt ?? new Date(), holdReason: input.reason || null },
    include: taskInclude,
  });
  return toOneTask(user.householdId, updated);
}

export async function releaseTask(user: SessionUser, id: string): Promise<Task> {
  await findOwnTask(user.householdId, id);
  const updated = await db.task.update({ where: { id }, data: { heldAt: null, holdReason: null }, include: taskInclude });
  return toOneTask(user.householdId, updated);
}

export async function toggleChecklistItem(user: SessionUser, id: string, itemId: string, input: ChecklistToggleInput): Promise<Task> {
  const row = await findOwnTask(user.householdId, id);
  assertCanComplete(user, row);
  const { count } = await db.taskChecklistItem.updateMany({ where: { id: itemId, taskId: id }, data: { done: input.done } });
  if (count === 0) throw notFound("Checklist item not found");
  return toOneTask(user.householdId, await findOwnTask(user.householdId, id));
}
