import * as React from "react";
import { ArrowRightIcon, CheckIcon, PauseCircleIcon, PlayCircleIcon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PendingContent } from "@/components/shared/loading-state";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { cn } from "@/lib/utils";
import { fetchLinkedTask } from "../data/tasks-requests";
import { canCompleteTask, dueState, taskPath, type TaskDetail } from "../types/tasks";
import { TaskAssignees } from "./task-assignees";
import { TaskBlockedDialog } from "./task-blocked-dialog";
import { TaskComments } from "./task-comments";
import { TaskHoldBadge, TaskWaitingBadge } from "./task-flags";
import { TaskHoldDialog } from "./task-hold-dialog";
import { TaskLinksPanel } from "./task-links";
import { useTaskActions } from "./use-task-actions";
import { useTaskText } from "./use-task-text";

type LinkedTaskPanelProps = {
  /** The origin feature, e.g. `"expense"`. */
  originType: string;
  /** The record's key in that feature, e.g. the expense instance id. */
  originId: string;
  /** Data instead of fetching it (stories, tests); `detail: null` = no linked task. */
  initialData?: { detail: TaskDetail | null; habitants: Habitant[] };
  /** Shown when the record has no linked task (e.g. "Paid by direct debit: no task needed"). */
  emptyText?: string;
  /** After the task changed (done, undone, on hold…): e.g. reload the expense, which follows the task. */
  onChanged?: () => void;
  /** With a title, the panel draws its own card ("Payment task"); without, it's content for the host's card. */
  title?: string;
  className?: string;
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; detail: TaskDetail | null; habitants: Habitant[] };

function PanelBody({ detail, habitants, reload }: { detail: TaskDetail; habitants: Habitant[]; reload: () => void }) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();
  const { task, today, viewer, links, comments } = detail;
  const [confirmBlocked, setConfirmBlocked] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const { submit, busy, pendingIntent } = useTaskActions(task, {
    action: "/tasks",
    onChanged: reload,
    canUndo: viewer.canManage,
    onBlocked: () => setConfirmBlocked(true),
  });
  const open = task.status === "open";
  const due = dueState(task, today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full border-2",
            open ? "border-muted-foreground/40" : "border-primary bg-primary text-primary-foreground",
          )}
          aria-hidden="true"
        >
          {!open && <CheckIcon className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link to={taskPath(task.id)} className={cn("font-medium hover:underline", !open && "text-muted-foreground line-through")}>
            {task.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className={cn(open && due === "overdue" && "font-medium text-destructive", open && due === "today" && "font-medium text-warning")}>
              {open ? text.dueLabel(task, today) : t(`status.${task.status}`)}
            </span>
            {open && <TaskHoldBadge task={task} full />}
            {open && <TaskWaitingBadge task={task} />}
          </div>
        </div>
        <TaskAssignees task={task} habitants={habitants} withNames />
      </div>

      <div className="flex flex-wrap gap-2">
        {open && canCompleteTask(task, viewer) && (
          <Button size="sm" disabled={busy} loading={pendingIntent === "complete"} onClick={() => submit("complete")}>
            <CheckIcon />
            {t("actions.complete")}
          </Button>
        )}
        {!open && viewer.canManage && (
          <Button size="sm" variant="outline" disabled={busy} loading={pendingIntent === "reopen"} onClick={() => submit("reopen")}>
            <RotateCcwIcon />
            {t("actions.reopen")}
          </Button>
        )}
        {open &&
          viewer.canManage &&
          (task.hold ? (
            <Button size="sm" variant="outline" disabled={busy} loading={pendingIntent === "release"} onClick={() => submit("release")}>
              <PlayCircleIcon />
              {t("hold.release")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setHolding(true)}>
              <PauseCircleIcon />
              {t("hold.action")}
            </Button>
          ))}
        <Button asChild size="sm" variant="ghost">
          <Link to={taskPath(task.id)}>
            {t("linked.openTask")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>

      <TaskLinksPanel taskId={task.id} links={links} canManage={viewer.canManage} onChanged={reload} />

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("comments.title")}</h4>
        <TaskComments taskId={task.id} comments={comments} habitants={habitants} onChanged={reload} />
      </div>

      {confirmBlocked && (
        <TaskBlockedDialog task={task} open onOpenChange={setConfirmBlocked} onConfirm={() => submit("complete", { force: "true" })} />
      )}
      {holding && <TaskHoldDialog task={task} open onOpenChange={setHolding} onHold={(reason) => submit("hold", { reason })} />}
    </div>
  );
}

/**
 * The task another feature linked to one of its records, for that record's page: e.g. an expense's pay
 * task with its status, who pays, on hold, what it waits for and the comment thread, with the actions.
 * Loads its own data, so the other feature only renders it (composed in the route):
 *
 *   <LinkedTaskPanel originType="expense" originId={expense.id} onChanged={revalidate} />
 */
export function LinkedTaskPanel({ originType, originId, initialData, emptyText, onChanged, title, className }: LinkedTaskPanelProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const [state, setState] = React.useState<State>(() => (initialData ? { status: "ready", ...initialData } : { status: "loading" }));
  const [reloads, setReloads] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const reload = React.useCallback(() => {
    setRefreshing(true);
    setReloads((value) => value + 1);
    onChanged?.();
  }, [onChanged]);

  React.useEffect(() => {
    if (initialData && reloads === 0) return;
    let cancelled = false;
    Promise.all([fetchLinkedTask(originType, originId), fetchHouseholdOverview()])
      .then(([detail, household]) => {
        if (!cancelled) setState({ status: "ready", detail, habitants: household.habitants });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [originType, originId, reloads, initialData]);

  const content = (
    <div className={cn("flex flex-col gap-3", !title && className)}>
      {state.status === "loading" && (
        <div className="flex flex-col gap-3" role="status" aria-label={t("linked.loading")}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="h-8 w-40" />
        </div>
      )}
      {state.status === "error" && (
        <InlineAlert tone="error">
          {t("linked.error")}{" "}
          <button type="button" className="font-medium underline" onClick={reload}>
            {t("place.retry")}
          </button>
        </InlineAlert>
      )}
      {state.status === "ready" &&
        (state.detail ? (
          <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
            <PanelBody detail={state.detail} habitants={state.habitants} reload={reload} />
          </PendingContent>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText ?? t("linked.none")}</p>
        ))}
    </div>
  );
  if (!title) return content;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {content}
    </Card>
  );
}
