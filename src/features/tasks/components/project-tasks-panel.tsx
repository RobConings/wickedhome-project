import * as React from "react";
import { ChevronDownIcon, CornerDownRightIcon, ListChecksIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingContent } from "@/components/shared/loading-state";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchPlaces, type Place } from "@/features/places";
import { cn } from "@/lib/utils";
import { fetchTasksOverview } from "../data/tasks-requests";
import { chainDepths } from "../types/task-chain";
import { compareTasks, type Task, type TasksOverview } from "../types/tasks";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";
import { InlineRetry } from "@/components/shared/inline-retry";
import { EmptyNote } from "@/components/shared/empty-note";
import { usePanelData } from "@/lib/hooks/use-panel-data";

type ProjectTasksPanelProps = {
  projectId: string;
  /** New tasks start in this place (e.g. the project's first room). */
  placeId?: string | null;
  /** After a task was added, completed or changed (e.g. to refresh the project's progress). */
  onChanged?: () => void;
  /** Data instead of fetching it (stories, tests). */
  initialData?: { overview: TasksOverview; habitants: Habitant[]; places: Place[] };
};

/**
 * The tasks of one project, for the project page: open ones as a chain (what can start first, then what waits
 * for it, e.g. "Buy materials" → "Start tiling"), the done ones folded away, and "Add a task" in the project.
 * Loads its own data, so the projects feature only renders it; quick actions post to the tasks route.
 */
export function ProjectTasksPanel({ projectId, placeId, onChanged, initialData }: ProjectTasksPanelProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const { state, reload: reloadData, retry, refreshing } = usePanelData(
    () =>
      Promise.all([fetchTasksOverview({ projectId }), fetchHouseholdOverview(), fetchPlaces()]).then(([overview, household, places]) => ({
        overview,
        habitants: household.habitants,
        places,
      })),
    [projectId],
    { initialData, keepDataOnError: true },
  );
  const [showDone, setShowDone] = React.useState(false);
  const reload = React.useCallback(() => {
    reloadData();
    onChanged?.();
  }, [reloadData, onChanged]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label={t("project.loading")}>
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <InlineRetry message={t("project.error")} onRetry={retry} />
    );
  }

  const { overview, habitants, places } = state.data;
  const open = overview.tasks.filter((task) => task.status === "open");
  const done = overview.tasks.filter((task) => task.status !== "open").sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  const depths = chainDepths(open);
  const ordered = [...open].sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0) || compareTasks(a, b));
  const row = (task: Task, depth = 0) => (
    <div key={task.id} className={cn("flex items-center gap-1.5", depth > 0 && (depth > 1 ? "pl-8" : "pl-4"))}>
      {depth > 0 && <CornerDownRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <ul className="min-w-0 flex-1">
        <TaskRow task={task} today={overview.today} habitants={habitants} viewer={overview.viewer} hideProject action="/tasks" onChanged={reload} />
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
        {open.length === 0 && done.length === 0 ? (
          <EmptyNote icon={ListChecksIcon}>{t("project.empty")}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {open.length === 0 && <p className="text-sm text-muted-foreground">{t("project.allDone")}</p>}
            {ordered.map((task) => row(task, Math.min(depths.get(task.id) ?? 0, 2)))}
          </div>
        )}
      </PendingContent>

      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" aria-expanded={showDone} onClick={() => setShowDone((value) => !value)}>
            <ChevronDownIcon className={cn("transition-transform", showDone && "rotate-180")} />
            {t("project.done", { count: done.length })}
          </Button>
          {showDone && <div className="flex flex-col gap-2">{done.map((task) => row(task))}</div>}
        </div>
      )}

      {overview.viewer.canManage && (
        <TaskFormDialog
          habitants={habitants}
          places={places}
          today={overview.today}
          defaults={{ type: "job", placeId: placeId ?? null, projectId }}
          trigger={
            <Button variant="outline" size="sm" className="self-start">
              <PlusIcon />
              {t("project.add")}
            </Button>
          }
          onOpenChange={(next) => {
            if (!next) reload();
          }}
        />
      )}
    </div>
  );
}
