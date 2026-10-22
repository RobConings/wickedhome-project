import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { GeneralFormField } from "@/components/shared/general-form";
import { GeneralFormDialog } from "@/components/shared/general-form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { HabitantPicker, type Habitant } from "@/features/household";
import type { TaskActionResult } from "../data/tasks-loaders";
import type { Task } from "../types/tasks";
import { useTaskText } from "./use-task-text";

type CompleteTaskDialogProps = {
  task: Pick<Task, "id" | "title" | "rrule"> & Partial<Pick<Task, "waitingFor">>;
  habitants: Habitant[];
  /** Pre-selected: the logged-in user's habitant. */
  currentHabitantId?: string | null;
  /** Adults may record that someone else did it; children complete as themselves. */
  canChooseWho: boolean;
  trigger: React.ReactElement;
};

/**
 * Mark a task as done with a note ("used 2 bags of filler") and who did it. A `GeneralFormDialog` posting
 * `complete` to `/tasks`; a task that waits for open tasks offers "Complete anyway".
 */
export function CompleteTaskDialog({ task, habitants, currentHabitantId, canChooseWho, trigger }: CompleteTaskDialogProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const waitingFor = task.waitingFor ?? [];
  // The server refused because the task waits for others (it may know more than this page).
  const [blocked, setBlocked] = React.useState(false);
  const askForce = waitingFor.length > 0 || blocked;

  const fields: GeneralFormField[] = [
    { name: "force", type: "switch", label: t("blocked.completeAnyway"), hidden: !askForce },
    {
      name: "completedById",
      type: "custom",
      label: t("complete.who"),
      optional: true,
      hidden: !canChooseWho,
      render: ({ id, name, value, setValue, invalid, disabled }) => (
        <HabitantPicker
          id={id}
          name={name}
          habitants={habitants}
          value={typeof value === "string" ? value : null}
          onChange={setValue}
          invalid={invalid}
          disabled={disabled}
          clearable
        />
      ),
    },
    { name: "note", type: "textarea", label: t("complete.note"), optional: true, rows: 2, maxLength: 500, placeholder: t("complete.notePlaceholder") },
  ];

  return (
    <GeneralFormDialog<TaskActionResult>
      trigger={trigger}
      onOpenChange={(next) => next && setBlocked(false)}
      title={t("complete.title", { title: task.title })}
      description={task.rrule ? t("complete.recurringDescription") : t("complete.description")}
      contentClassName="sm:max-w-sm"
      action="/tasks"
      intent="complete"
      hiddenFields={{ id: task.id }}
      fields={fields}
      defaultValues={{ completedById: currentHabitantId ?? null, force: false, note: "" }}
      submitLabel={t("actions.complete")}
      intro={
        askForce ? (
          <InlineAlert tone="info">{t("blocked.description", { titles: waitingFor.map((other) => other.title).join(", ") || "…" })}</InlineAlert>
        ) : undefined
      }
      isSuccess={(result) => {
        if (result.blocked) setBlocked(true);
        return result.ok === true;
      }}
      onSuccess={(result) => {
        const next = result.task;
        toast.success(
          next?.status === "open" && next.dueDate
            ? t("toast.doneNext", { title: task.title, date: text.day(next.dueDate, { weekday: "long" }) })
            : t("toast.done", { title: task.title }),
        );
      }}
    />
  );
}
