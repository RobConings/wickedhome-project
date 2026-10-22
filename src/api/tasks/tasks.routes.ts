import { Router } from "express";
import {
  checklistToggleInputSchema,
  linkedHoldsQuerySchema,
  linkedTaskQuerySchema,
  taskCommentInputSchema,
  taskCompleteInputSchema,
  taskHoldInputSchema,
  taskInputSchema,
  taskLinkInputSchema,
  taskSkipInputSchema,
  taskSnoozeInputSchema,
  tasksQuerySchema,
} from "@/features/tasks/types/tasks";
import { idSchema } from "@/types/common";
import { registerCalendarSource } from "../calendar/calendar-sources";
import { parse } from "../lib/http";
import { currentUser, requireRole, requireUser } from "../lib/session";
import { addTaskComment, deleteTaskComment, updateTaskComment } from "./task-comments";
import { addTaskLink, removeTaskLink } from "./task-links";
import {
  completeTask,
  createTask,
  deleteTask,
  getLinkedHolds,
  getLinkedTaskDetail,
  getTaskDetail,
  getTasksOverview,
  getTasksSummary,
  holdTask,
  releaseTask,
  reopenTask,
  skipTask,
  snoozeTask,
  toggleChecklistItem,
  updateTask,
} from "./tasks.service";
import { tasksSource } from "./tasks.source";
// Pay tasks for expenses: linked-task handler, expense listener and the daily `tasks.pay-tasks` job.
import "./pay-tasks";
// Notifications: assigned to you, the morning digest, can start now, payments (docs/NOTIFICATIONS.md).
import { currentAssigneeIds, notifyAssigned } from "./task-notifications";

// Open tasks with a due date appear on the household calendar.
registerCalendarSource(tasksSource);

export const tasksRouter = Router();

tasksRouter.use(requireUser);

/** Adults and owners manage tasks. Children may complete (and tick off) tasks assigned to them. */
const canManage = requireRole("owner", "adult");

tasksRouter.get("/", async (req, res) => {
  const query = parse(tasksQuerySchema, req.query);
  res.json(await getTasksOverview(currentUser(req), query));
});

// Before `/:id`, so "summary" is never read as an id.
tasksRouter.get("/summary", async (req, res) => {
  res.json(await getTasksSummary(currentUser(req)));
});

// Linked tasks on hold, per origin id: `?originType=expense` → `{ "<expense id>": "reason" | null }`.
tasksRouter.get("/linked/holds", async (req, res) => {
  const { originType } = parse(linkedHoldsQuerySchema, req.query);
  res.json(await getLinkedHolds(currentUser(req), originType));
});

// The linked task of another feature's record (e.g. an expense's pay task); `null` when there is none.
tasksRouter.get("/linked", async (req, res) => {
  const { originType, originId } = parse(linkedTaskQuerySchema, req.query);
  res.json(await getLinkedTaskDetail(currentUser(req), originType, originId));
});

tasksRouter.post("/", canManage, async (req, res) => {
  const user = currentUser(req);
  const input = parse(taskInputSchema, req.body);
  const task = await createTask(user.householdId, input, { createdById: user.id });
  notifyAssigned(user, task);
  res.status(201).json(task);
});

tasksRouter.get("/:id", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await getTaskDetail(currentUser(req), id));
});

tasksRouter.put("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(taskInputSchema, req.body);
  const user = currentUser(req);
  const before = await currentAssigneeIds(user.householdId, id);
  const task = await updateTask(user.householdId, id, input);
  notifyAssigned(user, task, before);
  res.json(task);
});

tasksRouter.delete("/:id", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  await deleteTask(currentUser(req).householdId, id);
  res.status(204).end();
});

// Children allowed: the service checks the task is assigned to them.
tasksRouter.post("/:id/complete", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(taskCompleteInputSchema, req.body);
  res.json(await completeTask(currentUser(req), id, input));
});

tasksRouter.post("/:id/skip", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(taskSkipInputSchema, req.body);
  res.json(await skipTask(currentUser(req), id, input));
});

tasksRouter.post("/:id/snooze", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const input = parse(taskSnoozeInputSchema, req.body);
  res.json(await snoozeTask(currentUser(req), id, input));
});

tasksRouter.post("/:id/reopen", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await reopenTask(currentUser(req), id));
});

tasksRouter.post("/:id/hold", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await holdTask(currentUser(req), id, parse(taskHoldInputSchema, req.body ?? {})));
});

tasksRouter.post("/:id/release", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await releaseTask(currentUser(req), id));
});

tasksRouter.post("/:id/links", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.json(await addTaskLink(currentUser(req), id, parse(taskLinkInputSchema, req.body)));
});

tasksRouter.delete("/:id/links/:otherTaskId", canManage, async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const otherTaskId = parse(idSchema, req.params.otherTaskId);
  res.json(await removeTaskLink(currentUser(req), id, otherTaskId));
});

// Everyone in the household may comment (children too); only the author edits or deletes.
tasksRouter.post("/:id/comments", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.status(201).json(await addTaskComment(currentUser(req), id, parse(taskCommentInputSchema, req.body)));
});

tasksRouter.put("/:id/comments/:commentId", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const commentId = parse(idSchema, req.params.commentId);
  res.json(await updateTaskComment(currentUser(req), id, commentId, parse(taskCommentInputSchema, req.body)));
});

tasksRouter.delete("/:id/comments/:commentId", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const commentId = parse(idSchema, req.params.commentId);
  await deleteTaskComment(currentUser(req), id, commentId);
  res.status(204).end();
});

// Children allowed: the service checks the task is assigned to them.
tasksRouter.put("/:id/checklist/:itemId", async (req, res) => {
  const id = parse(idSchema, req.params.id);
  const itemId = parse(idSchema, req.params.itemId);
  const input = parse(checklistToggleInputSchema, req.body);
  res.json(await toggleChecklistItem(currentUser(req), id, itemId, input));
});
