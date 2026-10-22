import * as React from "react";
import {
  AlarmClockIcon,
  ArrowLeftIcon,
  BellIcon,
  CheckIcon,
  Link2Icon,
  MessageSquareIcon,
  PauseCircleIcon,
  PencilIcon,
  PlayCircleIcon,
  RepeatIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { ConfirmDialog } from "../components/confirm-dialog";
import { DescriptionItem, DescriptionList } from "../components/description-list";
import { PageHeader } from "../components/page-header";
import type { Habitant } from "@/features/household";
import { PlaceBadge, type Place } from "@/features/places";
import { useSamePagePending } from "../lib/pending";
import { cn } from "@/lib/utils";
import { CompleteTaskDialog } from "../components/complete-task-dialog";
import { TaskAssignees } from "../components/task-assignees";
import { TaskChecklist } from "../components/task-checklist";
import { TaskComments } from "../components/task-comments";
import { TaskHoldBadge, TaskOriginBadge, TaskProjectChip, TaskWaitingBadge } from "../components/task-flags";
import { TaskFormDialog, type TaskProjectField } from "../components/task-form-dialog";
import { TaskHoldDialog } from "../components/task-hold-dialog";
import { TaskLinksPanel } from "../components/task-links";
import { TaskHistory } from "../components/task-history";
import { TaskPriorityBadge } from "../components/task-priority-badge";
import { TaskReadinessBadge } from "../components/task-readiness-badge";
import { TaskTypeBadge } from "../components/task-type-badge";
import { REPEAT_PARAM } from "../types/task-repeat";
import { SNOOZE_OPTIONS, snoozeDate } from "../types/task-views";
import { useTaskActions } from "../components/use-task-actions";
import { useTaskText } from "../components/use-task-text";
import { canCompleteTask, dueState, movedStartDate, taskLocation, type TaskDetail, type TaskViewer } from "../types/tasks";

type TaskDetailScreenProps = {
  detail: TaskDetail;
  habitants: Habitant[];
  places: Place[];
  canManage: boolean;
  currentHabitantId?: string | null;
  /**
   * The task's materials, rendered by the route (Shopping's `TaskMaterialsPanel`), so this screen
   * doesn't depend on the shopping feature.
   */
  materials?: React.ReactNode;
  /** The task's documents (instructions, quotes, photos), rendered by the route (Documents' `DocumentAttachments`). */
  attachments?: React.ReactNode;
  /** Optional "Project" field in the edit form, composed by the route. */
  projectField?: TaskProjectField;
};

/** One task: readiness, the details, its steps and materials, and who did it before. */
export function TaskDetailScreen({
  detail,
  habitants,
  places,
  canManage,
  currentHabitantId,
  materials,
  attachments,
  projectField,
}: TaskDetailScreenProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const text = useTaskText();
  const { task, history, today, upcoming, links, comments } = detail;
  const viewer: TaskViewer = { habitantId: currentHabitantId ?? null, canManage };
  const { submit, busy, pendingIntent } = useTaskActions(task, { action: "/tasks", canUndo: canManage });
  const [holding, setHolding] = React.useState(false);
  const linked = Boolean(task.origin);
  // "Repeat this" (`?repeat=1`) opens the form with Repeats switched on; the param is removed at once.
  const [searchParams, setSearchParams] = useSearchParams();
  const repeatRequested = searchParams.get(REPEAT_PARAM) === "1";
  const [repeating, setRepeating] = React.useState(canManage && repeatRequested && !linked);
  React.useEffect(() => {
    if (!repeatRequested) return;
    setSearchParams(
      (params) => {
        params.delete(REPEAT_PARAM);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }, [repeatRequested, setSearchParams]);
  // Reloads after materials or steps changed (readiness, progress).
  const reloading = useSamePagePending();
  const open = task.status === "open";
  const canComplete = open && canCompleteTask(task, viewer);
  const due = dueState(task, today);
  const recurrence = text.recurrence(task.rrule);
  const location = taskLocation(task);

  const actions = (
    <>
      {canComplete && (
        <CompleteTaskDialog
          task={task}
          habitants={habitants}
          currentHabitantId={currentHabitantId}
          canChooseWho={canManage}
          trigger={
            <Button disabled={busy}>
              <CheckIcon />
              {t("actions.complete")}
            </Button>
          }
        />
      )}
      {canManage && open && (
        <>
          <Button variant="outline" disabled={busy} loading={pendingIntent === "skip"} onClick={() => submit("skip")}>
            <SkipForwardIcon />
            {t("actions.skip")}
          </Button>
          {task.hold ? (
            <Button variant="outline" disabled={busy} loading={pendingIntent === "release"} onClick={() => submit("release")}>
              <PlayCircleIcon />
              {t("hold.release")}
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} loading={pendingIntent === "hold"} onClick={() => setHolding(true)}>
              <PauseCircleIcon />
              {t("hold.action")}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={busy} loading={pendingIntent === "snooze"}>
                <AlarmClockIcon />
                {t("actions.snooze")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {SNOOZE_OPTIONS.map((option) => {
                const date = snoozeDate(option, today);
                return (
                  <DropdownMenuItem key={option} onSelect={() => submit("snooze", { until: date })}>
                    <span className="flex-1">{t(`snooze.${option}`)}</span>
                    <span className="text-xs text-muted-foreground">{text.day(date, { weekday: "short" })}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      {canManage && !open && (
        <Button variant="outline" disabled={busy} loading={pendingIntent === "reopen"} onClick={() => submit("reopen")}>
          <RotateCcwIcon />
          {t("actions.reopen")}
        </Button>
      )}
      {canManage && (
        <>
          <TaskFormDialog
            task={task}
            habitants={habitants}
            places={places}
            today={today}
            projectField={projectField}
            trigger={
              <Button variant="outline">
                <PencilIcon />
                {tCommon("actions.edit")}
              </Button>
            }
          />
          {!linked && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}>
                <Trash2Icon />
                {tCommon("actions.delete")}
              </Button>
            }
            title={t("delete.title", { title: task.title })}
            description={task.materials ? t("delete.withMaterials") : t("delete.description")}
            confirmLabel={tCommon("actions.delete")}
            cancelLabel={tCommon("actions.cancel")}
            destructive
            onConfirm={() => submit("delete", { redirectTo: "/tasks" })}
          />
          )}
        </>
      )}
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/tasks" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={task.title}
        description={recurrence ?? undefined}
        actions={actions}
      />

      <PageGrid columns="main-sidebar">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="flex-wrap items-center">
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-2xl font-semibold tracking-tight",
                    open && due === "overdue" && "text-destructive",
                    open && due === "today" && "text-warning",
                  )}
                >
                  {open ? text.dueLabel(task, today) : t(`status.${task.status}`)}
                </span>
                {open && task.dueDate && (
                  <span className="text-sm text-muted-foreground">
                    {text.whenText(task)}
                  </span>
                )}
                {open && text.reminderLabel(task) && (
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                    <BellIcon className="size-3.5" aria-hidden="true" />
                    {text.reminderLabel(task)}
                    {task.remindedAt && ` · ${t("reminder.sent")}`}
                  </span>
                )}
                {(task.origin || (open && (task.hold || task.waitingFor.length > 0))) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TaskOriginBadge task={task} full />
                    {open && <TaskHoldBadge task={task} full />}
                    {open && <TaskWaitingBadge task={task} />}
                  </div>
                )}
              </div>
              {/* Readiness changes when materials are bought or added. */}
              <div className="flex items-center gap-2" aria-busy={reloading || undefined}>
                {reloading && (
                  <span className="flex animate-appear text-muted-foreground">
                    <Spinner />
                  </span>
                )}
                <TaskReadinessBadge task={task} />
              </div>
            </CardHeader>
            <DescriptionList>
              <DescriptionItem label={t("fields.type")}>
                <TaskTypeBadge type={task.type} />
              </DescriptionItem>
              <DescriptionItem label={t("fields.place")}>
                {task.place ? (
                  <PlaceBadge place={task.place} floorName={task.place.floorName} />
                ) : (
                  <span className="font-normal text-muted-foreground">{t("detail.noPlace")}</span>
                )}
                {location && <span className="sr-only"> ({t(`filters.${location}`)})</span>}
              </DescriptionItem>
              {task.project && (
                <DescriptionItem label={t("project.label")}>
                  <TaskProjectChip task={task} className="text-sm" />
                </DescriptionItem>
              )}
              <DescriptionItem label={t("fields.assignees")}>
                {task.assigneeIds.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <TaskAssignees task={task} habitants={habitants} withNames />
                    {task.rotateAssignees && (
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("assignees.rotation", {
                          names: task.assigneeIds.flatMap((id) => habitants.find((habitant) => habitant.id === id)?.name ?? []).join(" → "),
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="font-normal text-muted-foreground">{t("detail.unassigned")}</span>
                )}
              </DescriptionItem>
              <DescriptionItem label={t("fields.priority")}>
                <TaskPriorityBadge priority={task.priority} />
              </DescriptionItem>
              <DescriptionItem label={t("fields.estimate")}>
                {text.duration(task.estimatedMinutes) ?? <span className="font-normal text-muted-foreground">{t("estimate.none")}</span>}
              </DescriptionItem>
              {task.notes && (
                <DescriptionItem label={t("fields.notes")} wide>
                  <span className="font-normal whitespace-pre-line">{task.notes}</span>
                </DescriptionItem>
              )}
            </DescriptionList>
          </Card>

          {/* Jobs are where materials matter most: right under the details. */}
          {task.type === "job" && materials}

          {task.checklist.length > 0 && (
            <Card>
              <CardTitle>{t("fields.checklist")}</CardTitle>
              <TaskChecklist task={task} canToggle={canCompleteTask(task, viewer)} />
            </Card>
          )}

          {task.type !== "job" && materials}

          {attachments}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquareIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("comments.title")}
              </CardTitle>
            </CardHeader>
            <TaskComments taskId={task.id} comments={comments} habitants={habitants} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("links.title")}
              </CardTitle>
            </CardHeader>
            <TaskLinksPanel taskId={task.id} links={links} canManage={canManage} />
          </Card>

          {task.rrule && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RepeatIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("detail.repeats")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="font-medium">{recurrence}</p>
                {upcoming.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-muted-foreground">{t("detail.thenOn")}</p>
                    <ul className="flex flex-col gap-0.5">
                      {upcoming.map((date) => (
                        <li key={date} className="tabular-nums">
                          {/* The same time, timeslot or number of days on every occurrence. */}
                          {text.whenText({ ...task, dueDate: date, startDate: movedStartDate(task, date) })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  open && <p className="text-muted-foreground">{t("detail.lastOccurrence")}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardTitle>{t("history.title")}</CardTitle>
            <TaskHistory history={history} habitants={habitants} />
          </Card>
        </div>
      </PageGrid>

      {holding && <TaskHoldDialog task={task} open onOpenChange={setHolding} onHold={(reason) => submit("hold", { reason })} />}
      {repeating && (
        <TaskFormDialog task={task} habitants={habitants} places={places} today={today} open onOpenChange={setRepeating} startRepeating projectField={projectField} />
      )}
    </PageContainer>
  );
}
