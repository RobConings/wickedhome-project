import type { SessionUser } from "@/features/auth/types/auth";
import { wouldCreateCycle, type TaskLinkInput, type TaskLinks } from "@/features/tasks/types/tasks";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { taskRefSelect, toTaskRef } from "./task-rows";

/*
 * Links between tasks: "A waits for B" (BLOCKED_BY, stored as A → B) or plain "related" (stored once, shown
 * on both). One link per pair, in either direction: adding a link between two tasks replaces the old one.
 * A blocked task can't be completed while B is open (unless "complete anyway"); cycles are refused.
 */

const byDue = <T extends { dueDate: string | null; title: string }>(a: T, b: T) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title);

/** What a task waits for, what waits for it, and related tasks (open first, then by due date). */
export async function loadTaskLinks(taskId: string): Promise<TaskLinks> {
  const [from, to] = await Promise.all([
    db.taskLink.findMany({ where: { taskId }, select: { kind: true, otherTask: { select: taskRefSelect } } }),
    db.taskLink.findMany({ where: { otherTaskId: taskId }, select: { kind: true, task: { select: taskRefSelect } } }),
  ]);
  const openFirst = <T extends { status: string; dueDate: string | null; title: string }>(list: T[]) =>
    list.sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open") || byDue(a, b));
  return {
    blockedBy: openFirst(from.filter((link) => link.kind === "BLOCKED_BY").map((link) => toTaskRef(link.otherTask))),
    blocks: openFirst(to.filter((link) => link.kind === "BLOCKED_BY").map((link) => toTaskRef(link.task))),
    related: openFirst([
      ...from.filter((link) => link.kind === "RELATED").map((link) => toTaskRef(link.otherTask)),
      ...to.filter((link) => link.kind === "RELATED").map((link) => toTaskRef(link.task)),
    ]),
  };
}

/** Adds (or replaces) the link between a task and another task of the household. */
export async function addTaskLink(user: SessionUser, taskId: string, input: TaskLinkInput): Promise<TaskLinks> {
  const found = await db.task.count({ where: { householdId: user.householdId, id: { in: [taskId, input.otherTaskId] } } });
  if (found !== 2 || taskId === input.otherTaskId) {
    if (taskId === input.otherTaskId) throw badRequest("Validation failed", { otherTaskId: ["sameTask"] });
    throw notFound("Task not found");
  }
  // "A blocks B" is stored as "B waits for A".
  const [from, to] = input.kind === "blocks" ? [input.otherTaskId, taskId] : [taskId, input.otherTaskId];
  const pair = { OR: [{ taskId: from, otherTaskId: to }, { taskId: to, otherTaskId: from }] };

  if (input.kind !== "related") {
    const edges = await db.taskLink.findMany({
      where: { kind: "BLOCKED_BY", task: { householdId: user.householdId }, NOT: pair },
      select: { taskId: true, otherTaskId: true },
    });
    if (wouldCreateCycle(edges.map((edge) => [edge.taskId, edge.otherTaskId] as const), from, to)) {
      throw badRequest("Validation failed", { otherTaskId: ["cycle"] });
    }
  }

  await db.$transaction([
    db.taskLink.deleteMany({ where: pair }),
    db.taskLink.create({ data: { taskId: from, otherTaskId: to, kind: input.kind === "related" ? "RELATED" : "BLOCKED_BY" } }),
  ]);
  return loadTaskLinks(taskId);
}

/** Removes the link between two tasks, whichever direction it has. */
export async function removeTaskLink(user: SessionUser, taskId: string, otherTaskId: string): Promise<TaskLinks> {
  const found = await db.task.count({ where: { householdId: user.householdId, id: taskId } });
  if (!found) throw notFound("Task not found");
  await db.taskLink.deleteMany({
    where: { OR: [{ taskId, otherTaskId }, { taskId: otherTaskId, otherTaskId: taskId }] },
  });
  return loadTaskLinks(taskId);
}
