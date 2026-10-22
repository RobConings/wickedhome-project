import { AlarmClockIcon, EllipsisVerticalIcon, PauseCircleIcon, PlayCircleIcon, RepeatIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskIntent } from "../data/tasks-loaders";
import { taskPath, type Task } from "../types/tasks";
import { REPEAT_PARAM } from "../types/task-repeat";
import { SNOOZE_OPTIONS, snoozeDate } from "../types/task-views";
import { useTaskText } from "./use-task-text";

type TaskQuickActionsProps = {
  task: Pick<Task, "id" | "title" | "status" | "dueDate"> & Partial<Pick<Task, "hold" | "origin" | "rrule">>;
  today: string;
  /** From `useTaskActions`. */
  onAction: (intent: TaskIntent, extra?: Record<string, string>) => void;
  /** "Put on hold…": opens the reason dialog. Without it, the menu has no hold items. */
  onHold?: () => void;
  disabled?: boolean;
  /** A skip, snooze or reopen is being saved: a spinner in place of the menu icon. */
  loading?: boolean;
};

/**
 * Skip, put on hold, repeat, snooze (tomorrow, in 3 days, this weekend, next week) or reopen, from a small
 * menu. Adults only. "Repeat this" opens the task's form with the repeat settings.
 */
export function TaskQuickActions({ task, today, onAction, onHold, disabled, loading = false }: TaskQuickActionsProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const open = task.status === "open";
  const canRepeat = !task.origin;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative z-10 shrink-0"
          aria-label={t("actions.more", { title: task.title })}
          disabled={disabled}
          loading={loading}
        >
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {open ? (
          <>
            <DropdownMenuItem onSelect={() => onAction("skip")}>
              <SkipForwardIcon />
              {t("actions.skip")}
            </DropdownMenuItem>
            {onHold &&
              (task.hold ? (
                <DropdownMenuItem onSelect={() => onAction("release")}>
                  <PlayCircleIcon />
                  {t("hold.release")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={onHold}>
                  <PauseCircleIcon />
                  {t("hold.action")}
                </DropdownMenuItem>
              ))}
            {canRepeat && (
              <DropdownMenuItem asChild>
                <Link to={`${taskPath(task.id)}?${REPEAT_PARAM}=1`}>
                  <RepeatIcon />
                  {task.rrule ? t("repeat.change") : t("repeat.action")}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <AlarmClockIcon className="size-3.5" aria-hidden="true" />
              {t("actions.snooze")}
            </DropdownMenuLabel>
            {SNOOZE_OPTIONS.map((option) => {
              const date = snoozeDate(option, today);
              return (
                <DropdownMenuItem key={option} onSelect={() => onAction("snooze", { until: date })}>
                  <span className="flex-1">{t(`snooze.${option}`)}</span>
                  <span className="text-xs text-muted-foreground">{text.day(date, { weekday: "short" })}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : (
          <DropdownMenuItem onSelect={() => onAction("reopen")}>
            <RotateCcwIcon />
            {t("actions.reopen")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
