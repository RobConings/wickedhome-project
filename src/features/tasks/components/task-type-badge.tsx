import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskType } from "../types/tasks";
import { TASK_TYPE_ICONS } from "./task-type-icons";

type TaskTypeBadgeProps = {
  type: TaskType;
  /** Icon only (with an accessible label), for dense lists. */
  iconOnly?: boolean;
  className?: string;
};

/** The task's type: chore, to-do, job, maintenance or errand. */
export function TaskTypeBadge({ type, iconOnly = false, className }: TaskTypeBadgeProps) {
  const { t } = useTranslation("tasks");
  const Icon = TASK_TYPE_ICONS[type];
  const label = t(`types.${type}`);
  if (iconOnly) {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)} title={label}>
        <Icon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Badge variant="secondary" className={cn("gap-1.5", className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
