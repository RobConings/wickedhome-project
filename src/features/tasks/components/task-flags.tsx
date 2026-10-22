import { HourglassIcon, Link2Icon, MessageSquareIcon, PauseCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { TagChip } from "@/components/shared/tag-chip";
import { cn } from "@/lib/utils";
import { projectPath } from "@/types/projects";
import type { Task } from "../types/tasks";
import { useTaskText } from "./use-task-text";

/**
 * Small flags on a task: where it comes from (a linked task), on hold, waiting for other tasks, comments.
 * Compact for rows; `full` spells them out (detail page, linked panel).
 */

const chip = "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

/** "Waste collection", linking back to the origin when it has a page. */
export function TaskOriginBadge({ task, full = false, className }: { task: Pick<Task, "origin">; full?: boolean; className?: string }) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  if (!task.origin) return null;
  const label = full ? text.origin(task.origin.type) : t(`originShort.${task.origin.type}`, { defaultValue: t("originShort.other") });
  const content = (
    <>
      <Link2Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </>
  );
  const classes = cn(chip, "bg-section-soft text-section-foreground", className);
  return full && task.origin.href ? (
    <Link to={task.origin.href} className={cn(classes, "relative z-10 hover:underline")}>
      {content}
    </Link>
  ) : (
    <span className={classes} title={text.origin(task.origin.type)}>
      {content}
    </span>
  );
}

/** "On hold" (with the reason when `full`). Still overdue when late; only visibly blocked. */
export function TaskHoldBadge({ task, full = false, className }: { task: Pick<Task, "hold">; full?: boolean; className?: string }) {
  const { t } = useTranslation("tasks");
  if (!task.hold) return null;
  const reason = task.hold.reason;
  return (
    <span className={cn(chip, "bg-warning-soft text-warning-foreground", className)} title={reason ?? undefined}>
      <PauseCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{full && reason ? t("hold.withReason", { reason }) : t("hold.badge")}</span>
    </span>
  );
}

/** "Waiting for Calculate the invoice" (+n more). */
export function TaskWaitingBadge({ task, className }: { task: Pick<Task, "status" | "waitingFor">; className?: string }) {
  const { t } = useTranslation("tasks");
  const [first] = task.waitingFor;
  if (task.status !== "open" || !first) return null;
  const more = task.waitingFor.length - 1;
  const label = more > 0 ? t("waiting.badgeMore", { title: first.title, count: more }) : t("waiting.badge", { title: first.title });
  return (
    <span className={cn(chip, "bg-info-soft text-info-foreground", className)} title={task.waitingFor.map((other) => other.title).join(", ")}>
      <HourglassIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** The project the task is part of, linking to it. */
export function TaskProjectChip({ task, className }: { task: Pick<Task, "project">; className?: string }) {
  const { t } = useTranslation("tasks");
  if (!task.project) return null;
  return (
    <TagChip
      label={task.project.name}
      color={task.project.color}
      to={projectPath(task.project.id)}
      title={t("project.chip", { name: task.project.name })}
      className={className}
    />
  );
}

export function TaskCommentCount({ task, className }: { task: Pick<Task, "commentCount">; className?: string }) {
  const { t } = useTranslation("tasks");
  if (task.commentCount === 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 tabular-nums", className)} title={t("comments.count", { count: task.commentCount })}>
      <MessageSquareIcon className="size-3.5" aria-hidden="true" />
      {task.commentCount}
      <span className="sr-only">{t("comments.count", { count: task.commentCount })}</span>
    </span>
  );
}
