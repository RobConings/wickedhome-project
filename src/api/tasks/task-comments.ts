import type { SessionUser } from "@/features/auth/types/auth";
import type { TaskComment, TaskCommentInput } from "@/features/tasks/types/tasks";
import { db, type Prisma } from "../lib/db";
import { forbidden, notFound } from "../lib/http";

/**
 * The comment thread of a task. Everyone in the household reads and writes (children too: "I can't find
 * the ladder"); only the author edits or deletes their own comment. A payment's thread is its pay task's.
 */

const MAX_COMMENTS = 200;

const commentInclude = {
  author: { select: { id: true, email: true, habitant: { select: { id: true, name: true } } } },
} as const satisfies Prisma.TaskCommentInclude;
type CommentRow = Prisma.TaskCommentGetPayload<{ include: typeof commentInclude }>;

const toComment = (row: CommentRow, user: SessionUser): TaskComment => ({
  id: row.id,
  body: row.body,
  authorId: row.authorId,
  authorName: row.author ? (row.author.habitant?.name ?? row.author.email.split("@")[0] ?? null) : null,
  authorHabitantId: row.author?.habitant?.id ?? null,
  createdAt: row.createdAt.toISOString(),
  editedAt: row.editedAt?.toISOString() ?? null,
  mine: row.authorId !== null && row.authorId === user.id,
});

async function assertOwnTask(user: SessionUser, taskId: string) {
  const found = await db.task.count({ where: { id: taskId, householdId: user.householdId } });
  if (!found) throw notFound("Task not found");
}

/** Oldest first, like a chat. */
export async function loadTaskComments(user: SessionUser, taskId: string): Promise<TaskComment[]> {
  const rows = await db.taskComment.findMany({
    where: { taskId },
    include: commentInclude,
    orderBy: { createdAt: "desc" },
    take: MAX_COMMENTS,
  });
  return rows.reverse().map((row) => toComment(row, user));
}

export async function addTaskComment(user: SessionUser, taskId: string, input: TaskCommentInput): Promise<TaskComment> {
  await assertOwnTask(user, taskId);
  const row = await db.taskComment.create({ data: { taskId, authorId: user.id, body: input.body }, include: commentInclude });
  return toComment(row, user);
}

async function findOwnComment(user: SessionUser, taskId: string, commentId: string) {
  await assertOwnTask(user, taskId);
  const row = await db.taskComment.findFirst({ where: { id: commentId, taskId } });
  if (!row) throw notFound("Comment not found");
  if (row.authorId !== user.id) throw forbidden("Only your own comments");
  return row;
}

export async function updateTaskComment(user: SessionUser, taskId: string, commentId: string, input: TaskCommentInput): Promise<TaskComment> {
  await findOwnComment(user, taskId, commentId);
  const row = await db.taskComment.update({
    where: { id: commentId },
    data: { body: input.body, editedAt: new Date() },
    include: commentInclude,
  });
  return toComment(row, user);
}

export async function deleteTaskComment(user: SessionUser, taskId: string, commentId: string): Promise<void> {
  await findOwnComment(user, taskId, commentId);
  await db.taskComment.delete({ where: { id: commentId } });
}
