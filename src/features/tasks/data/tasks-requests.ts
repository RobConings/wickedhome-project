import { api } from "../lib/api-client";
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

const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

export function fetchTasksOverview(query: TasksQuery = {}) {
  const params = new URLSearchParams();
  if (query.placeId) params.set("placeId", query.placeId);
  if (query.projectId) params.set("projectId", query.projectId);
  const search = params.toString();
  return api.get<TasksOverview>(search ? `/tasks?${search}` : "/tasks");
}
export const fetchTaskDetail = (id: string) => api.get<TaskDetail>(taskPath(id));
/** Counts and the most urgent open tasks, for the dashboard. */
export const fetchTasksSummary = () => api.get<TasksSummary>("/tasks/summary");

export const createTask = (input: TaskInput) => api.post<Task>("/tasks", input);
export const updateTask = (id: string, input: TaskInput) => api.put<Task>(taskPath(id), input);
export const deleteTask = (id: string) => api.delete(taskPath(id));
export const completeTask = (id: string, input: TaskCompleteInput) => api.post<TaskCompleteResult>(`${taskPath(id)}/complete`, input);
export const skipTask = (id: string, input: TaskSkipInput) => api.post<Task>(`${taskPath(id)}/skip`, input);
export const snoozeTask = (id: string, input: TaskSnoozeInput) => api.post<Task>(`${taskPath(id)}/snooze`, input);
export const reopenTask = (id: string) => api.post<Task>(`${taskPath(id)}/reopen`);
export const toggleChecklistItem = (id: string, itemId: string, input: ChecklistToggleInput) =>
  api.put<Task>(`${taskPath(id)}/checklist/${encodeURIComponent(itemId)}`, input);
export const holdTask = (id: string, input: TaskHoldInput) => api.post<Task>(`${taskPath(id)}/hold`, input);
export const releaseTask = (id: string) => api.post<Task>(`${taskPath(id)}/release`);
export const addTaskLink = (id: string, input: TaskLinkInput) => api.post<TaskLinks>(`${taskPath(id)}/links`, input);
export const removeTaskLink = (id: string, otherTaskId: string) =>
  api.delete<TaskLinks>(`${taskPath(id)}/links/${encodeURIComponent(otherTaskId)}`);
export const addTaskComment = (id: string, input: TaskCommentInput) => api.post<TaskComment>(`${taskPath(id)}/comments`, input);
export const updateTaskComment = (id: string, commentId: string, input: TaskCommentInput) =>
  api.put<TaskComment>(`${taskPath(id)}/comments/${encodeURIComponent(commentId)}`, input);
export const deleteTaskComment = (id: string, commentId: string) => api.delete(`${taskPath(id)}/comments/${encodeURIComponent(commentId)}`);
/** The linked task of another feature's record (e.g. an expense's pay task), or `null`. */
export const fetchLinkedTask = (originType: string, originId: string) =>
  api.get<TaskDetail | null>(`/tasks/linked?originType=${encodeURIComponent(originType)}&originId=${encodeURIComponent(originId)}`);
/** Which records of another feature have their linked task on hold (origin id → reason). */
export const fetchLinkedHolds = (originType: string) =>
  api.get<LinkedHolds>(`/tasks/linked/holds?originType=${encodeURIComponent(originType)}`);
