import * as React from "react";
import { BellIcon, CheckIcon, ListChecksIcon, RepeatIcon, TimerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Habitant } from "@/features/household";
import { PlaceBadge } from "@/features/places";
import { cn } from "@/lib/utils";
import { canCompleteTask, dueState, taskPath, type Task, type TaskCompletedToday, type TaskViewer } from "../types/tasks";
import { TaskAssignees } from "./task-assignees";
import { TaskBlockedDialog } from "./task-blocked-dialog";
import { TaskCommentCount, TaskHoldBadge, TaskOriginBadge, TaskProjectChip, TaskWaitingBadge } from "./task-flags";
import { TaskHoldDialog } from "./task-hold-dialog";
import { TaskPriorityBadge } from "./task-priority-badge";
import { TaskQuickActions } from "./task-quick-actions";
import { TaskReadinessBadge } from "./task-readiness-badge";
import { TaskTypeBadge } from "./task-type-badge";
import { useTaskActions } from "./use-task-actions";
import { useTaskText } from "./use-task-text";

type TaskRowProps = {
  task: Task;
  today: string;
  habitants: Habitant[];
  viewer: TaskViewer;
  /**
   * Shown as closed today (struck through until tomorrow): one-off tasks done today, and today's
   * occurrence of a recurring task (whose row has already moved on to its next date).
   */
  completion?: TaskCompletedToday;
  /** Leave out the place, e.g. when the list is already grouped by place. */
  hidePlace?: boolean;
  /** Leave out the project chip, e.g. on the project's own page. */
  hideProject?: boolean;
  /** Route that handles the quick actions; defaults to the current one. */
  action?: string;
  /** After a quick action succeeded. */
  onChanged?: () => void;
  /**
   * `card` (default): a bordered `<li>` for simple lists (a place's or project's tasks). `plain`: just the
   * content, for a `GeneralList` row (the list draws dividers and padding). `tile`: a card for the tiles view.
   */
  variant?: "card" | "plain" | "tile";
};

/**
 * One task in a list: one tap to complete (and to undo), what/when/where at a glance, where it comes from,
 * on hold or waiting for other tasks, and skip/hold/repeat/snooze in a menu.
 */
export function TaskRow({
  task,
  today,
  habitants,
  viewer,
  completion,
  hidePlace = false,
  hideProject = false,
  action,
  onChanged,
  variant = "card",
}: TaskRowProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const [confirmBlocked, setConfirmBlocked] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const { submit, busy, pendingIntent, result } = useTaskActions(task, {
    action,
    onChanged,
    canUndo: viewer.canManage,
    onBlocked: () => setConfirmBlocked(true),
  });
  // A recurring task closed today shows today's occurrence as done; the task itself is open again.
  const doneToday = Boolean(completion);
  const open = task.status === "open" && !doneToday;
  // Done at once (optimistic). In a section that reloads its own data (`onChanged`), it stays done after
  // the save until that reload brings the new list.
  const completing =
    (pendingIntent === "complete" && fetcherNotBlocked(result)) ||
    (Boolean(onChanged) && !busy && result?.ok === true && result.intent === "complete" && result.task?.status === "done");
  const reopening = pendingIntent === "reopen";
  const showAsDone = (!open || completing) && !reopening;
  const due = dueState(task, today);
  const recurrence = text.recurrence(task.rrule);
  const steps = task.checklist.length;
  const stepsDone = task.checklist.filter((item) => item.done).length;
  const canComplete = open && canCompleteTask(task, viewer);
  // Undo with the same tap: a one-off task closed today (a recurring one has moved on; undo from its page).
  const canUndo = !open && viewer.canManage && task.status !== "open";
  const doer = completion?.completedById ? habitants.find((habitant) => habitant.id === completion.completedById) : undefined;

  const statusLabel = completion
    ? completion.outcome === "skipped"
      ? t("status.skipped")
      : doer
        ? t("history.doneBy", { name: doer.name })
        : t("status.done")
    : t(`status.${task.status}`);

  const checkButton = (
    <button
      type="button"
      onClick={() => (open ? submit("complete") : canUndo && submit("reopen"))}
      disabled={(open ? !canComplete : !canUndo) || busy}
      aria-pressed={showAsDone}
      aria-label={
        open
          ? t("actions.completeTask", { title: task.title })
          : canUndo
            ? t("actions.undoTask", { title: task.title })
            : statusLabel
      }
      title={open ? t("actions.complete") : canUndo ? t("actions.undo") : undefined}
      className={cn(
        "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:size-7",
        showAsDone ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 text-transparent",
        canComplete && !busy && "hover:border-primary hover:text-primary",
        !canComplete && open && "cursor-not-allowed opacity-50",
        open && task.waitingFor.length > 0 && "border-dashed",
      )}
    >
      <CheckIcon className="size-4" aria-hidden="true" />
    </button>
  );

  const titleLine = (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to={taskPath(task.id)}
        className={cn(
          "font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
          variant === "tile" ? "line-clamp-2" : "truncate",
          showAsDone && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </Link>
      {open && <TaskPriorityBadge priority={task.priority} iconOnly />}
    </div>
  );

  const reminder = text.reminderLabel(task);

  const meta = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <TaskTypeBadge type={task.type} iconOnly />
      <span
        className={cn(
          "shrink-0",
          open && due === "overdue" && "font-medium text-destructive",
          open && due === "today" && "font-medium text-warning",
        )}
      >
        {open ? text.dueLabel(task, today) : statusLabel}
      </span>
      {open && reminder && (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
          <BellIcon className="size-3.5" aria-hidden="true" />
          {reminder}
        </span>
      )}
      {open && <TaskHoldBadge task={task} />}
      {open && <TaskWaitingBadge task={task} />}
      <TaskOriginBadge task={task} />
      {!hidePlace && task.place && <PlaceBadge place={task.place} className="py-0.5 text-xs" />}
      {!hideProject && <TaskProjectChip task={task} />}
      {recurrence && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <RepeatIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{recurrence}</span>
        </span>
      )}
      {open && task.materials && <TaskReadinessBadge task={task} compact />}
      {open && steps > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 tabular-nums" title={t("checklist.progress", { done: stepsDone, total: steps })}>
          <ListChecksIcon className="size-3.5" aria-hidden="true" />
          {`${stepsDone}/${steps}`}
          <span className="sr-only">{t("checklist.progress", { done: stepsDone, total: steps })}</span>
        </span>
      )}
      {open && task.estimatedMinutes && (
        <span className="inline-flex shrink-0 items-center gap-1">
          <TimerIcon className="size-3.5" aria-hidden="true" />
          {text.duration(task.estimatedMinutes)}
        </span>
      )}
      <TaskCommentCount task={task} />
    </div>
  );

  const quickActions = viewer.canManage && !doneToday && (
    <TaskQuickActions
      task={task}
      today={today}
      onAction={submit}
      onHold={() => setHolding(true)}
      disabled={busy}
      loading={busy && pendingIntent !== "complete" && pendingIntent !== "reopen"}
    />
  );

  const dialogs = (
    <>
      {confirmBlocked && (
        <TaskBlockedDialog
          task={task}
          open
          onOpenChange={setConfirmBlocked}
          onConfirm={() => submit("complete", { force: "true" })}
        />
      )}
      {holding && (
        <TaskHoldDialog task={task} open onOpenChange={setHolding} onHold={(reason) => submit("hold", { reason })} />
      )}
    </>
  );

  if (variant === "tile") {
    return (
      <div
        className={cn(
          "relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors has-[a:hover]:bg-accent/40",
          busy && "opacity-70",
          showAsDone && "bg-card/60",
          open && task.hold && "border-warning/50",
        )}
      >
        <div className="flex items-start gap-3">
          {checkButton}
          <div className="min-w-0 flex-1 pt-1">{titleLine}</div>
          {quickActions}
        </div>
        {meta}
        <TaskAssignees task={task} habitants={habitants} className="mt-auto" />
        {dialogs}
      </div>
    );
  }

  const Root = variant === "card" ? "li" : "div";
  return (
    <Root
      className={cn(
        "relative flex items-center gap-3 transition-colors",
        variant === "card" && "rounded-xl border bg-card px-3 py-2.5 shadow-xs has-[a:hover]:bg-accent/40",
        variant === "card" && showAsDone && "bg-card/60",
        variant === "card" && open && task.hold && "border-warning/50",
        busy && "opacity-70",
      )}
    >
      {checkButton}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {titleLine}
        {meta}
      </div>
      <TaskAssignees task={task} habitants={habitants} className="hidden sm:flex" />
      {quickActions}
      {dialogs}
    </Root>
  );
}

/** While completing, the row looks done unless the last answer was "blocked". */
const fetcherNotBlocked = (result: { blocked?: boolean } | undefined) => !result?.blocked;
