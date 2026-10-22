import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import type { z } from "zod";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchPlaces, type Place } from "@/features/places";
import { ApiRequestError } from "@/lib/api-client";
import { formDataToObject, toFormResult, type FormResult } from "@/lib/forms";
import {
  checklistToggleInputSchema,
  taskCommentInputSchema,
  taskCompleteInputSchema,
  taskHoldInputSchema,
  taskInputSchema,
  taskLinkInputSchema,
  taskSkipInputSchema,
  taskSnoozeInputSchema,
  type Task,
  type TaskDetail,
  type TaskRef,
  type TasksOverview,
} from "../types/tasks";
import {
  addTaskComment,
  addTaskLink,
  completeTask,
  createTask,
  deleteTask,
  deleteTaskComment,
  fetchTaskDetail,
  fetchTasksOverview,
  holdTask,
  releaseTask,
  removeTaskLink,
  reopenTask,
  skipTask,
  snoozeTask,
  toggleChecklistItem,
  updateTask,
  updateTaskComment,
} from "./tasks-requests";

export const TASK_INTENTS = [
  "create",
  "update",
  "delete",
  "complete",
  "skip",
  "snooze",
  "reopen",
  "toggle-item",
  "hold",
  "release",
  "link-add",
  "link-remove",
  "comment-add",
  "comment-edit",
  "comment-delete",
] as const;
export type TaskIntent = (typeof TASK_INTENTS)[number];

export type TaskActionResult = FormResult & {
  intent?: TaskIntent;
  /** The task after the change, e.g. to tell when a recurring task comes back. */
  task?: Task;
  /** After completing: tasks that no longer wait for anything. */
  unblocked?: TaskRef[];
  /** Completing was refused because the task waits for open tasks ("complete anyway?"). */
  blocked?: boolean;
};

export type TasksPageData = { overview: TasksOverview; habitants: Habitant[]; places: Place[] };
export type TaskDetailPageData = { detail: TaskDetail; habitants: Habitant[]; places: Place[] };

export async function tasksLoader(): Promise<TasksPageData> {
  const [overview, household, places] = await Promise.all([fetchTasksOverview(), fetchHouseholdOverview(), fetchPlaces()]);
  return { overview, habitants: household.habitants, places };
}

/**
 * Views, filters and grouping live in the search params but are applied in the browser, so changing them
 * needs no new data and shows at once. Submits and explicit revalidations still reload.
 */
export function tasksShouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const onlySearchChanged = !formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search;
  return onlySearchChanged ? false : defaultShouldRevalidate;
}

export async function taskDetailLoader({ params }: LoaderFunctionArgs): Promise<TaskDetailPageData> {
  try {
    const [detail, household, places] = await Promise.all([
      fetchTaskDetail(params.taskId ?? ""),
      fetchHouseholdOverview(),
      fetchPlaces(),
    ]);
    return { detail, habitants: household.habitants, places };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

/** Validates plain values with a zod schema, returning field errors keyed by the first path segment. */
function validate<T extends z.ZodType>(schema: T, values: Record<string, unknown>) {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data as z.infer<T> };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_");
    (errors[key] ??= []).push(issue.message);
  }
  return { errors };
}

/** The task form posts plain fields, one `assigneeIds` per habitant, and the checklist as JSON. */
function taskFormValues(formData: FormData) {
  const values = formDataToObject(formData);
  values.assigneeIds = formData.getAll("assigneeIds").map(String).filter(Boolean);
  if (values.estimatedMinutes === "none") values.estimatedMinutes = undefined;
  if (values.reminderMinutes === "none") values.reminderMinutes = undefined;
  values.rotateAssignees = formData.get("rotateAssignees") === "on" || formData.get("rotateAssignees") === "true";
  // A project field that was posted empty removes the project; a form without the field keeps it.
  if (formData.has("projectId") && !values.projectId) values.projectId = null;
  try {
    const checklist: unknown = JSON.parse(String(formData.get("checklist") || "[]"));
    values.checklist = Array.isArray(checklist) ? checklist : [];
  } catch {
    values.checklist = [];
  }
  return values;
}

/**
 * One action for every tasks page (and sections that post to `/tasks`, like the one on a place page);
 * the form's `intent` field says what to do. A `redirectTo` field redirects after success.
 */
export async function tasksAction({ request }: ActionFunctionArgs): Promise<TaskActionResult | Response> {
  const formData = await request.formData();
  const intent = (formData.get("intent") as TaskIntent | null) ?? "create";
  const id = String(formData.get("id") ?? "");
  const redirectTo = formData.get("redirectTo");
  const done = (task?: Task): TaskActionResult | Response =>
    typeof redirectTo === "string" && redirectTo.startsWith("/") ? redirect(redirectTo) : { ok: true, intent, task };

  try {
    switch (intent) {
      case "create":
      case "update": {
        const { data: input, errors } = validate(taskInputSchema, taskFormValues(formData));
        if (errors) return { errors, intent };
        return done(intent === "create" ? await createTask(input) : await updateTask(id, input));
      }
      case "delete":
        await deleteTask(id);
        return done();
      case "complete": {
        const { data: input, errors } = validate(taskCompleteInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        const { unblocked, ...task } = await completeTask(id, input);
        const result = done(task);
        return result instanceof Response ? result : { ...result, unblocked };
      }
      case "skip": {
        const { data: input, errors } = validate(taskSkipInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        return done(await skipTask(id, input));
      }
      case "snooze": {
        const { data: input, errors } = validate(taskSnoozeInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        return done(await snoozeTask(id, input));
      }
      case "reopen":
        return done(await reopenTask(id));
      case "hold": {
        const { data: input, errors } = validate(taskHoldInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        return done(await holdTask(id, input));
      }
      case "release":
        return done(await releaseTask(id));
      case "link-add": {
        const { data: input, errors } = validate(taskLinkInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        await addTaskLink(id, input);
        return done();
      }
      case "link-remove":
        await removeTaskLink(id, String(formData.get("otherTaskId") ?? ""));
        return done();
      case "comment-add":
      case "comment-edit": {
        const { data: input, errors } = validate(taskCommentInputSchema, formDataToObject(formData));
        if (errors) return { errors, intent };
        if (intent === "comment-add") await addTaskComment(id, input);
        else await updateTaskComment(id, String(formData.get("commentId") ?? ""), input);
        return done();
      }
      case "comment-delete":
        await deleteTaskComment(id, String(formData.get("commentId") ?? ""));
        return done();
      case "toggle-item": {
        const values = { done: formData.get("done") === "true" };
        const { data: input, errors } = validate(checklistToggleInputSchema, values);
        if (errors) return { errors, intent };
        return done(await toggleChecklistItem(id, String(formData.get("itemId") ?? ""), input));
      }
      default:
        return { formError: i18n.t("common:errors.generic") };
    }
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "blocked") return { intent, blocked: true };
    return {
      ...toFormResult(error, {
        not_found: i18n.t("tasks:errors.notFound"),
        conflict: intent === "delete" ? i18n.t("tasks:errors.linkedDelete") : i18n.t("tasks:errors.alreadyClosed"),
        forbidden: i18n.t("tasks:errors.forbidden"),
      }),
      intent,
    };
  }
}
