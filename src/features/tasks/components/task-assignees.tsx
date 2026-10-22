import { RotateCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import { onDutyIds, type Task } from "../types/tasks";

type TaskAssigneesProps = {
  task: Pick<Task, "assigneeIds" | "rotateAssignees">;
  habitants: Habitant[];
  /** Also show the names next to the avatars. */
  withNames?: boolean;
  className?: string;
};

/** Who is on duty, as avatars. A rotating task shows whose turn it is and the rotation order. */
export function TaskAssignees({ task, habitants, withNames = false, className }: TaskAssigneesProps) {
  const { t } = useTranslation("tasks");
  const byId = (id: string) => habitants.find((habitant) => habitant.id === id);
  const onDuty = onDutyIds(task).flatMap((id) => byId(id) ?? []);
  if (onDuty.length === 0) return null;
  const rotation = task.rotateAssignees
    ? t("assignees.rotation", { names: task.assigneeIds.flatMap((id) => byId(id)?.name ?? []).join(" → ") })
    : null;
  const names = onDuty.map((habitant) => habitant.name).join(", ");

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)} title={rotation ?? names}>
      <div className="flex shrink-0 -space-x-1.5">
        {onDuty.map((habitant) => (
          <HabitantAvatar key={habitant.id} habitant={habitant} size="sm" />
        ))}
      </div>
      {withNames && <span className="truncate text-sm">{names}</span>}
      {rotation && <RotateCwIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span className="sr-only">{rotation ? `${t("assignees.onDuty", { names })} (${rotation})` : t("assignees.label", { names })}</span>
    </div>
  );
}
