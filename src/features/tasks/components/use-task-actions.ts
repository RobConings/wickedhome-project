import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { TaskActionResult, TaskIntent } from "../data/tasks-loaders";
import type { Task } from "../types/tasks";
import { useTaskText } from "./use-task-text";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";

type UseTaskActionsOptions = {
  /** Route that handles the action; defaults to the current route (use `"/tasks"` from other pages). */
  action?: string;
  /** Called after a successful change, e.g. to reload a section that fetches its own data. */
  onChanged?: () => void;
  /** Offer "Undo" after completing a one-off task. */
  canUndo?: boolean;
  /** Completing was refused because the task waits for open tasks: ask "complete anyway?". */
  onBlocked?: () => void;
};

/**
 * Quick task actions (complete, skip, snooze, reopen, hold, tick off a step…) through one fetcher, with a
 * toast that says what happened, e.g. when a recurring task comes back or another task can start now.
 */
export function useTaskActions(
  task: Pick<Task, "id" | "title">,
  { action, onChanged, canUndo = false, onBlocked }: UseTaskActionsOptions = {},
) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const fetcher = useFetcher<TaskActionResult>();

  // Returns the fetcher's promise (settles after the action and the reload), e.g. for `ConfirmDialog`.
  const submit = React.useCallback(
    (intent: TaskIntent, extra: Record<string, string> = {}) =>
      fetcher.submit({ intent, id: task.id, ...extra }, { method: "post", ...(action && { action }) }),
    [fetcher, task.id, action],
  );

  useFetcherResult(fetcher, (result) => {
    if (result.blocked) {
      if (onBlocked) onBlocked();
      else toast.warning(t("blocked.toast", { title: task.title }));
      return;
    }
    if (result.formError) {
      toast.error(result.formError);
      return;
    }
    if (!result.ok) {
      // Quick actions have no form to show field errors in.
      toast.error(t("common:errors.generic"));
      return;
    }
    const next = result.task;
    const longDay = (date: string) => (date ? text.day(date, { weekday: "long" }) : "");
    const comesBack = next?.status === "open" && next.dueDate;
    switch (result.intent) {
      case "complete":
        if (comesBack) toast.success(t("toast.doneNext", { title: task.title, date: longDay(next.dueDate ?? "") }));
        else
          toast.success(t("toast.done", { title: task.title }), {
            action: canUndo ? { label: t("actions.undo"), onClick: () => submit("reopen") } : undefined,
          });
        for (const other of result.unblocked ?? []) toast.info(t("toast.unblocked", { title: other.title }));
        break;
      case "skip":
        toast.success(comesBack ? t("toast.skippedNext", { date: longDay(next.dueDate ?? "") }) : t("toast.skipped"));
        break;
      case "snooze":
        toast.success(t("toast.snoozed", { date: longDay(next?.dueDate ?? "") }));
        break;
      case "reopen":
        toast.success(t("toast.reopened"));
        break;
      case "hold":
        toast.success(t("toast.held"));
        break;
      case "release":
        toast.success(t("toast.released"));
        break;
      default:
        break;
    }
    onChanged?.();
  });

  const pendingIntent = fetcher.state !== "idle" ? (fetcher.formData?.get("intent") as TaskIntent | null) : null;
  return { submit, busy: fetcher.state !== "idle", pendingIntent, result: fetcher.data };
}
