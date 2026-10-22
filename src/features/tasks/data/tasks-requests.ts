import { api, restResource, withQuery } from "@/lib/api-client";
import type {
  ChecklistToggleInput,
  Task,
  TaskComment,
  TaskCommentInput,
  TaskCompleteInput,
  TaskCompleteResult,
  TaskDetail,
  TaskHoldInput,
  TaskLinkInput,
  TaskLinks,
  LinkedHolds,
  TaskInput,
  TaskSkipInput,
  TaskSnoozeInput,
  TasksOverview,
  TasksQuery,
  TasksSummary,
} from "../types/tasks";

const tasks = restResource<Task, TaskInput, TaskDetail>("/tasks");
const taskPath = tasks.path;

export const fetchTasksOverview = (query: TasksQuery = {}) =>
  tasks.list<TasksOverview>({ placeId: query.placeId, projectId: query.projectId });
export const fetchTaskDetail = tasks.get;
/** Counts and the most urgent open tasks, for the dashboard. */
export const fetchTasksSummary = () => api.get<TasksSummary>("/tasks/summary");

export const createTask = tasks.create;
export const updateTask = tasks.update;
export const deleteTask = tasks.remove;
export const completeTask = (id: string, input: TaskCompleteInput) => api.post<TaskCompleteResult>(taskPath(id, "complete"), input);
export const skipTask = (id: string, input: TaskSkipInput) => api.post<Task>(taskPath(id, "skip"), input);
export const snoozeTask = (id: string, input: TaskSnoozeInput) => api.post<Task>(taskPath(id, "snooze"), input);
export const reopenTask = (id: string) => api.post<Task>(taskPath(id, "reopen"));
export const toggleChecklistItem = (id: string, itemId: string, input: ChecklistToggleInput) =>
  api.put<Task>(taskPath(id, "checklist", itemId), input);
export const holdTask = (id: string, input: TaskHoldInput) => api.post<Task>(taskPath(id, "hold"), input);
export const releaseTask = (id: string) => api.post<Task>(taskPath(id, "release"));
export const addTaskLink = (id: string, input: TaskLinkInput) => api.post<TaskLinks>(taskPath(id, "links"), input);
export const removeTaskLink = (id: string, otherTaskId: string) =>
  api.delete<TaskLinks>(taskPath(id, "links", otherTaskId));
export const addTaskComment = (id: string, input: TaskCommentInput) => api.post<TaskComment>(taskPath(id, "comments"), input);
export const updateTaskComment = (id: string, commentId: string, input: TaskCommentInput) =>
  api.put<TaskComment>(taskPath(id, "comments", commentId), input);
export const deleteTaskComment = (id: string, commentId: string) => api.delete(taskPath(id, "comments", commentId));
/** The linked task of another feature's record (e.g. an expense's pay task), or `null`. */
export const fetchLinkedTask = (originType: string, originId: string) =>
  api.get<TaskDetail | null>(withQuery("/tasks/linked", { originType, originId }));
/** Which records of another feature have their linked task on hold (origin id → reason). */
export const fetchLinkedHolds = (originType: string) =>
  api.get<LinkedHolds>(withQuery("/tasks/linked/holds", { originType }));
