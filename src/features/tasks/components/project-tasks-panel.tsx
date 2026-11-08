import * as React from "react";
import { ChevronDownIcon, CornerDownRightIcon, ListChecksIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAsyncResource } from "@/lib/use-async-resource";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchPlaces, type Place } from "@/features/places";
import { cn } from "@/lib/utils";
import { fetchTasksOverview } from "../data/tasks-requests";
import { chainDepths } from "../types/task-chain";
import { compareTasks, type Task, type TasksOverview } from "../types/tasks";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";

type ProjectTasksPanelProps = {
  projectId: string;
  /** New tasks start in this place (e.g. the project's first room). */
  placeId?: string | null;
  /** After a task was added, completed or changed (e.g. to refresh the project's progress). */
  onChanged?: () => void;
  placeSelections?: React.ComponentProps<typeof TaskFormDialog>["placeSelections"];
  /** Data instead of fetching it (stories, tests). */
  initialData?: { overview: TasksOverview; habitants: Habitant[]; places: Place[] };
};

type RecordTasksPanelProps = Omit<ProjectTasksPanelProps, "projectId"> & { projectId?: string; deviceId?: string; assigneeId?: string };

/**
 * The tasks of one project, for the project page: open ones as a chain (what can start first, then what waits
 * for it, e.g. "Buy materials" → "Start tiling"), the done ones folded away, and "Add a task" in the project.
 * Loads its own data, so the projects feature only renders it; quick actions post to the tasks route.
 */
export function ProjectTasksPanel(props: ProjectTasksPanelProps) {
  return <RecordTasksPanel {...props} />;
}

/** Maintenance uses the same task records, completion rules and recurrence as the Tasks workspace. */
export function DeviceTasksPanel(props: Omit<ProjectTasksPanelProps, "projectId"> & { deviceId: string }) {
  return <RecordTasksPanel {...props} />;
}

export function HabitantTasksPanel(props: Omit<ProjectTasksPanelProps, "projectId"> & { assigneeId: string }) {
  return <RecordTasksPanel {...props} />;
}

function RecordTasksPanel({ projectId, deviceId, assigneeId, placeId, onChanged, initialData, placeSelections }: RecordTasksPanelProps) {
  const { t } = useTranslation("tasks");
  const { t: tCommon } = useTranslation();
  const [showDone, setShowDone] = React.useState(false);
  const { data, error, refresh } = useAsyncResource(`${projectId ?? ""}:${deviceId ?? ""}:${assigneeId ?? ""}`, async () => {
    const [overview, household, places] = await Promise.all([fetchTasksOverview({ projectId, deviceId, assigneeId }), fetchHouseholdOverview(), fetchPlaces()]);
    return { overview, habitants: household.habitants, places };
  }, { initial: initialData });
  const reload = () => { refresh(); onChanged?.(); };
  const labels = assigneeId ? "person" : deviceId ? "maintenance" : "project";
  if (!data && !error) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label={t(`${labels}.loading`)}>
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        {t(`${labels}.error`)}
        <Button variant="outline" size="sm" onClick={() => refresh()}>
          {tCommon("actions.retry")}
        </Button>
      </div>
    );
  }

  const { overview, habitants, places } = data;
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
      {error && <InlineAlert tone="error"><p>{t(`${labels}.error`)}</p><Button variant="outline" size="sm" onClick={refresh}>{tCommon("actions.retry")}</Button></InlineAlert>}
      <div>
        {open.length === 0 && done.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <ListChecksIcon className="size-4 shrink-0" aria-hidden="true" />
            {t(`${labels}.empty`)}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {open.length === 0 && <p className="text-sm text-muted-foreground">{t(`${labels}.allDone`)}</p>}
            {ordered.map((task) => row(task, Math.min(depths.get(task.id) ?? 0, 2)))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" aria-expanded={showDone} onClick={() => setShowDone((value) => !value)}>
            <ChevronDownIcon className={cn("transition-transform", showDone && "rotate-180")} />
            {t(`${labels}.done`, { count: done.length })}
          </Button>
          {showDone && <div className="flex flex-col gap-2">{done.map((task) => row(task))}</div>}
        </div>
      )}

      {overview.viewer.canManage && (
        <TaskFormDialog
          placeSelections={placeSelections}
          habitants={habitants}
          places={places}
          today={overview.today}
          defaults={{ type: assigneeId ? "chore" : deviceId ? "maintenance" : "job", assigneeIds: assigneeId ? [assigneeId] : [], placeId: placeId ?? null, projectId, deviceId }}
          trigger={
            <Button variant="outline" size="sm" className="self-start">
              <PlusIcon />
              {t(`${labels}.add`)}
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
