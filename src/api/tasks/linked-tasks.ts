import type { TaskType } from "@/features/tasks/types/tasks";
import { db, type TaskStatus as TaskStatusRow, type TaskType as TaskTypeRow } from "../lib/db";
import { optionalDate, toDate } from "./task-rows";
import { closeTaskOccurrence, deleteTaskRow, reopenTaskRow } from "./tasks.service";

/*
 * Linked tasks: tasks other features create and keep in sync for their own records, e.g. "Put out: Pmd"
 * per waste collection day, or "Pay Watergroep · € 52,30" per unpaid expense. They are normal tasks for
 * people (done/undo, assignees, notes, comments, on hold, lists, calendar) with an origin
 * (`originType` + `originId`, unique per household) that keeps title, type and due date in step.
 *
 * Use from another feature's API (never from the browser):
 *
 *   import { upsertLinkedTask, removeLinkedTask } from "../tasks/linked-tasks";
 *
 *   await upsertLinkedTask({ householdId, origin: { type: "waste", id: "2026-10-07", date: "2026-10-07",
 *     href: "/settings#waste" }, title: "Put out: Pmd", type: "chore", dueDate: "2026-10-06", dueTime: "20:00" });
 *   await removeLinkedTask({ householdId, type: "waste", id: "2026-10-07" });
 *
 * Rules: idempotent (running a sync twice changes nothing); a closed (done/skipped) task is never touched
 * by `upsertLinkedTask` or `removeLinkedTask`; while `origin.date` is unchanged a snoozed due date stays.
 * To react when people close or reopen your tasks, see `registerLinkedTaskHandler` (linked-task-handlers.ts).
 */

export type LinkedTaskOrigin = {
  /** The origin feature, lowercase: "waste", "expense". Labelled in the UI by `tasks:origin.<type>`. */
  type: string;
  /** Your record's key, unique per household and type. */
  id: string;
  /** Your record's date (collection day, due date). */
  date?: string | null;
  /** Where your record lives in the app. */
  href?: string | null;
};

export type LinkedTaskInput = {
  householdId: string;
  origin: LinkedTaskOrigin;
  title: string;
  type: TaskType;
  dueDate: string | null;
  /** `HH:MM` */
  dueTime?: string | null;
  /** Given: replaces the assignees (in order). Omitted: new tasks start unassigned, existing ones keep theirs. */
  assigneeIds?: string[];
  /** Only used when the task is created; afterwards notes belong to people. */
  notes?: string | null;
};

export type LinkedTaskState = {
  id: string;
  originId: string;
  originDate: string | null;
  status: "open" | "done" | "skipped";
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  assigneeIds: string[];
};

export type UpsertResult = { id: string; action: "created" | "updated" | "unchanged" | "closed" };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** The household's existing linked tasks of one origin type, any status. */
export async function listLinkedTasks(householdId: string, originType: string): Promise<LinkedTaskState[]> {
  const rows = await db.task.findMany({
    where: { householdId, originType },
    select: {
      id: true,
      originId: true,
      originDate: true,
      status: true,
      title: true,
      dueDate: true,
      dueTime: true,
      assignees: { orderBy: { position: "asc" }, select: { habitantId: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    originId: row.originId ?? "",
    originDate: optionalDate(row.originDate),
    status: row.status.toLowerCase() as LinkedTaskState["status"],
    title: row.title,
    dueDate: optionalDate(row.dueDate),
    dueTime: row.dueTime,
    assigneeIds: row.assignees.map((assignee) => assignee.habitantId),
  }));
}

/** Habitant ids of the household among `ids`, in the given order (removed habitants are dropped). */
async function ownHabitants(householdId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db.habitant.findMany({ where: { householdId, id: { in: ids } }, select: { id: true } });
  const known = new Set(rows.map((row) => row.id));
  return [...new Set(ids)].filter((id) => known.has(id));
}

type LinkedTaskFields = {
  title: string;
  type: TaskType;
  dueDate: string | null;
  dueTime: string | null;
  originDate: string | null;
  originHref: string | null;
  assigneeIds: string[];
};

/**
 * Pure: what an open linked task needs to change to match its origin. Empty when it already matches, so a
 * second sync writes nothing. The due date follows only when the origin's date or the due time changed (or
 * the origin has no date): a snoozed task keeps its new date. `assigneeIds` is set only when they differ
 * from the requested ones (and none requested = keep).
 */
export function linkedTaskChanges(
  existing: LinkedTaskFields,
  wanted: Pick<LinkedTaskInput, "title" | "type" | "dueDate" | "dueTime" | "origin" | "assigneeIds">,
): { changes: Partial<Omit<LinkedTaskFields, "assigneeIds">>; assigneeIds?: string[] } {
  const originDate = wanted.origin.date ?? null;
  const originHref = wanted.origin.href ?? null;
  const dueDate = wanted.dueDate ?? null;
  const dueTime = wanted.dueTime ?? null;
  const scheduleChanged = existing.originDate !== originDate || existing.dueTime !== dueTime || !originDate;
  const changes = {
    ...(existing.title !== wanted.title && { title: wanted.title }),
    ...(existing.type !== wanted.type && { type: wanted.type }),
    ...(existing.originHref !== originHref && { originHref }),
    ...(existing.originDate !== originDate && { originDate }),
    ...(scheduleChanged && existing.dueDate !== dueDate && { dueDate }),
    ...(existing.dueTime !== dueTime && { dueTime }),
  };
  const reassign = wanted.assigneeIds !== undefined && !sameList(existing.assigneeIds, wanted.assigneeIds);
  return { changes, ...(reassign && { assigneeIds: wanted.assigneeIds }) };
}

/**
 * Creates or updates the linked task of one record. An existing open task gets the new title, type and
 * link; its due date only when the origin's date or the due time changed (so a snooze survives a sync).
 * A closed task is left alone (`closed`).
 */
export async function upsertLinkedTask(input: LinkedTaskInput): Promise<UpsertResult> {
  const { householdId, origin } = input;
  const title = input.title.trim().slice(0, 120);
  const type = input.type.toUpperCase() as TaskTypeRow;
  const originDate = origin.date ? toDate(origin.date) : null;
  const dueDate = input.dueDate ? toDate(input.dueDate) : null;
  const dueTime = input.dueTime ?? null;
  const assigneeIds = input.assigneeIds ? await ownHabitants(householdId, input.assigneeIds) : undefined;

  const existing = await db.task.findUnique({
    where: { householdId_originType_originId: { householdId, originType: origin.type, originId: origin.id } },
    select: {
      id: true,
      status: true,
      title: true,
      type: true,
      dueDate: true,
      dueTime: true,
      originDate: true,
      originHref: true,
      assignees: { orderBy: { position: "asc" }, select: { habitantId: true } },
    },
  });

  if (!existing) {
    try {
      const created = await db.task.create({
        data: {
          householdId,
          title,
          type,
          notes: input.notes || null,
          dueDate,
          dueTime,
          originType: origin.type,
          originId: origin.id,
          originDate,
          originHref: origin.href ?? null,
          assignees: { create: (assigneeIds ?? []).map((habitantId, position) => ({ habitantId, position })) },
        },
        select: { id: true },
      });
      return { id: created.id, action: "created" };
    } catch (error) {
      // Created at the same moment by a concurrent sync: the unique origin makes this safe; update instead.
      if ((error as { code?: string }).code === "P2002") return upsertLinkedTask(input);
      throw error;
    }
  }
  if ((existing.status as TaskStatusRow) !== "OPEN") return { id: existing.id, action: "closed" };

  const { changes, assigneeIds: reassignTo } = linkedTaskChanges(
    {
      title: existing.title,
      type: existing.type.toLowerCase() as TaskType,
      dueDate: optionalDate(existing.dueDate),
      dueTime: existing.dueTime,
      originDate: optionalDate(existing.originDate),
      originHref: existing.originHref,
      assigneeIds: existing.assignees.map((assignee) => assignee.habitantId),
    },
    { title, type: input.type, dueDate: input.dueDate, dueTime, origin, assigneeIds },
  );
  const reassign = reassignTo !== undefined;
  if (Object.keys(changes).length === 0 && !reassign) return { id: existing.id, action: "unchanged" };
  const data = {
    ...(changes.title !== undefined && { title: changes.title }),
    ...(changes.type !== undefined && { type: changes.type.toUpperCase() as TaskTypeRow }),
    ...(changes.originHref !== undefined && { originHref: changes.originHref }),
    ...(changes.originDate !== undefined && { originDate: changes.originDate ? toDate(changes.originDate) : null }),
    ...(changes.dueDate !== undefined && { dueDate: changes.dueDate ? toDate(changes.dueDate) : null }),
    ...(changes.dueTime !== undefined && { dueTime: changes.dueTime }),
  };

  await db.$transaction(async (tx) => {
    if (reassign) {
      await tx.taskAssignee.deleteMany({ where: { taskId: existing.id } });
      await tx.taskAssignee.createMany({
        data: (reassignTo ?? []).map((habitantId, position) => ({ taskId: existing.id, habitantId, position })),
      });
    }
    if (Object.keys(data).length > 0) await tx.task.update({ where: { id: existing.id }, data });
  });
  return { id: existing.id, action: "updated" };
}

/** Removes the linked task of a record that no longer needs one. Only open tasks; `true` when one was removed. */
export async function removeLinkedTask({ householdId, type, id }: { householdId: string; type: string; id: string }): Promise<boolean> {
  const row = await db.task.findUnique({
    where: { householdId_originType_originId: { householdId, originType: type, originId: id } },
    select: { id: true, status: true },
  });
  if (!row || row.status !== "OPEN") return false;
  await deleteTaskRow(householdId, row.id);
  return true;
}

/**
 * Moves an open linked task to another key of the same origin type, e.g. a waste collection that moved to
 * another day: the task keeps its assignees, notes and comments. `false` when there's no open task under
 * `fromId` or `toId` is taken.
 */
export async function rekeyLinkedTask({
  householdId,
  type,
  fromId,
  toId,
}: {
  householdId: string;
  type: string;
  fromId: string;
  toId: string;
}): Promise<boolean> {
  const [from, taken] = await Promise.all([
    db.task.findUnique({
      where: { householdId_originType_originId: { householdId, originType: type, originId: fromId } },
      select: { id: true, status: true },
    }),
    db.task.count({ where: { householdId, originType: type, originId: toId } }),
  ]);
  if (!from || from.status !== "OPEN" || taken > 0) return false;
  await db.task.update({ where: { id: from.id }, data: { originId: toId } });
  return true;
}

/**
 * Closes the linked task because the origin is done by itself (e.g. the expense was marked paid on its
 * own page). Doesn't call the origin back. `false` when there's no open task.
 */
export async function completeLinkedTask({ householdId, type, id }: { householdId: string; type: string; id: string }): Promise<boolean> {
  const row = await db.task.findUnique({
    where: { householdId_originType_originId: { householdId, originType: type, originId: id } },
    select: { id: true, status: true },
  });
  if (!row || row.status !== "OPEN") return false;
  await closeTaskOccurrence(householdId, row.id, "done", { notifyOrigin: false });
  return true;
}

/** Reopens the linked task because the origin was undone (e.g. the expense marked unpaid). No callback. */
export async function reopenLinkedTask({ householdId, type, id }: { householdId: string; type: string; id: string }): Promise<boolean> {
  const row = await db.task.findUnique({
    where: { householdId_originType_originId: { householdId, originType: type, originId: id } },
    select: { id: true, status: true },
  });
  if (!row || row.status === "OPEN") return false;
  await reopenTaskRow(householdId, row.id, { notifyOrigin: false });
  return true;
}
