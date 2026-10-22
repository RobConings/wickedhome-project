import { ArrowDownIcon, FlagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "../types/tasks";

type TaskPriorityBadgeProps = {
  priority: TaskPriority;
  /** Icon only (with an accessible label), for lists. */
  iconOnly?: boolean;
  className?: string;
};

/** High priority gets a red flag, low an arrow down; normal shows nothing in lists. */
export function TaskPriorityBadge({ priority, iconOnly = false, className }: TaskPriorityBadgeProps) {
  const { t } = useTranslation("tasks");
  if (priority === "normal" && iconOnly) return null;
  const Icon = priority === "low" ? ArrowDownIcon : FlagIcon;
  const label = t(`priority.${priority}`);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-sm",
        priority === "high" ? "font-medium text-destructive" : "text-muted-foreground",
        className,
      )}
      title={iconOnly ? label : undefined}
    >
      {priority !== "normal" && <Icon className="size-3.5" aria-hidden="true" />}
      <span className={cn(iconOnly && "sr-only")}>{label}</span>
    </span>
  );
}
