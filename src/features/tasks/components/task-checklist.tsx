import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useFetchers } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TaskActionResult } from "../data/tasks-loaders";
import type { Task } from "../types/tasks";

type TaskChecklistProps = {
  task: Pick<Task, "id" | "checklist" | "status">;
  /** Whoever may complete the task may tick off its steps. */
  canToggle: boolean;
};

type ChecklistItem = Task["checklist"][number];

/**
 * The steps of a task, ticked off one by one. Shows the new state right away while it saves (one fetcher
 * per step, so quick ticks don't cancel each other) and flips back with a toast if a save fails.
 */
export function TaskChecklist({ task, canToggle }: TaskChecklistProps) {
  const { t } = useTranslation("tasks");
  // Ticks still being saved, so the count is optimistic too.
  const fetchers = useFetchers();
  const pending = new Map<string, boolean>();
  for (const fetcher of fetchers) {
    const data = fetcher.formData;
    if (data?.get("intent") === "toggle-item" && data.get("id") === task.id) {
      pending.set(String(data.get("itemId")), data.get("done") === "true");
    }
  }
  const doneCount = task.checklist.filter((item) => pending.get(item.id) ?? item.done).length;
  const disabled = !canToggle || task.status !== "open";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("checklist.progress", { done: doneCount, total: task.checklist.length })}</p>
      <ul className="flex flex-col gap-1">
        {task.checklist.map((item) => (
          <ChecklistRow key={item.id} taskId={task.id} item={item} disabled={disabled} />
        ))}
      </ul>
    </div>
  );
}

function ChecklistRow({ taskId, item, disabled }: { taskId: string; item: ChecklistItem; disabled: boolean }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<TaskActionResult>({ key: `task-${taskId}-step-${item.id}` });
  const pending = fetcher.formData;
  const done = pending ? pending.get("done") === "true" : item.done;

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok) toast.error(fetcher.data.formError ?? t("errors.generic"));
  }, [fetcher.state, fetcher.data, t]);

  return (
    <li>
      <label className={cn("flex items-start gap-3 rounded-md px-2 py-1.5 text-sm", !disabled && "cursor-pointer hover:bg-accent/50")}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={done}
          disabled={disabled}
          onChange={(event) =>
            void fetcher.submit(
              { intent: "toggle-item", id: taskId, itemId: item.id, done: String(event.target.checked) },
              { method: "post", action: "/tasks" },
            )
          }
        />
        <span className={cn(done && "text-muted-foreground line-through")}>{item.label}</span>
      </label>
    </li>
  );
}
