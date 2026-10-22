import {
  taskReadiness,
  type Task,
  type TaskMaterials,
  type TaskPriority,
  type TaskRef,
  type TaskStatus,
  type TaskType,
} from "@/features/tasks/types/tasks";
import { db, type Prisma } from "../lib/db";
import { notFound } from "../lib/http";
import { loadTaskMaterials } from "./task-materials";

/** Rows ⇄ contract for tasks, shared by the tasks service, links, comments and linked tasks. */

const placeSelect = {
  select: {
    id: true,
    name: true,
    kind: true,
    color: true,
    icon: true,
    floor: { select: { id: true, name: true, level: true } },
  },
} as const;

export const taskRefSelect = { id: true, title: true, status: true, dueDate: true } as const satisfies Prisma.TaskSelect;
type TaskRefRow = Prisma.TaskGetPayload<{ select: typeof taskRefSelect }>;

export const taskInclude = {
  place: placeSelect,
  assignees: { orderBy: { position: "asc" } },
  checklist: { orderBy: { position: "asc" } },
  // What it still waits for: blockers that are open.
  links: {
    where: { kind: "BLOCKED_BY", otherTask: { status: "OPEN" } },
    select: { otherTask: { select: taskRefSelect } },
    orderBy: { createdAt: "asc" },
  },
  _count: { select: { comments: true } },
  // The project chip on rows (projects feature).
  project: { select: { id: true, name: true, color: true } },
} as const satisfies Prisma.TaskInclude;
export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDate = (date: Date) => date.toISOString().slice(0, 10);
export const optionalDate = (date: Date | null) => (date ? fromDate(date) : null);
const lower = <T extends string>(value: string) => value.toLowerCase() as T;

export const toTaskRef = (row: TaskRefRow): TaskRef => ({
  id: row.id,
  title: row.title,
  status: lower<TaskStatus>(row.status),
  dueDate: optionalDate(row.dueDate),
});

export function toTask(row: TaskRow, materials: TaskMaterials | null): Task {
  const status = lower<TaskStatus>(row.status);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    type: lower<TaskType>(row.type),
    place: row.place
      ? {
          id: row.place.id,
          name: row.place.name,
          kind: row.place.kind === "ZONE" ? "zone" : "room",
          color: row.place.color,
          icon: row.place.icon,
          floorId: row.place.floor.id,
          floorName: row.place.floor.name,
          floorLevel: row.place.floor.level,
        }
      : null,
    assigneeIds: row.assignees.map((assignee) => assignee.habitantId),
    rotateAssignees: row.rotateAssignees,
    priority: lower<TaskPriority>(row.priority),
    estimatedMinutes: row.estimatedMinutes,
    status,
    dueDate: optionalDate(row.dueDate),
    rrule: row.rrule,
    recurrenceStart: optionalDate(row.recurrenceStart),
    checklist: row.checklist.map((item) => ({ id: item.id, label: item.label, done: item.done })),
    materials,
    readiness: taskReadiness({ status, materials }),
    closedAt: row.closedAt?.toISOString() ?? null,
    dueTime: row.dueTime,
    endTime: row.endTime,
    startDate: optionalDate(row.startDate),
    reminderMinutes: row.reminderMinutes,
    remindAt: row.remindAt?.toISOString() ?? null,
    remindedAt: row.remindedAt?.toISOString() ?? null,
    origin:
      row.originType && row.originId
        ? { type: row.originType, id: row.originId, date: optionalDate(row.originDate), href: row.originHref }
        : null,
    hold: row.heldAt ? { since: row.heldAt.toISOString(), reason: row.holdReason } : null,
    waitingFor: status === "open" ? row.links.map((link) => toTaskRef(link.otherTask)) : [],
    commentCount: row._count.comments,
    project: row.project ? { id: row.project.id, name: row.project.name, color: row.project.color } : null,
  };
}

/** Rows → tasks, with their materials loaded in one go. */
export async function toTasks(householdId: string, rows: TaskRow[]): Promise<Task[]> {
  const materials = await loadTaskMaterials(
    householdId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toTask(row, materials[row.id] ?? null));
}

export async function toOneTask(householdId: string, row: TaskRow): Promise<Task> {
  const [task] = await toTasks(householdId, [row]);
  if (!task) throw notFound("Task not found");
  return task;
}

export async function findOwnTask(householdId: string, id: string): Promise<TaskRow> {
  const row = await db.task.findFirst({ where: { id, householdId }, include: taskInclude });
  if (!row) throw notFound("Task not found");
  return row;
}
