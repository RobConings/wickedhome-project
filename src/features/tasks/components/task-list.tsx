import * as React from "react";
import { ListChecksIcon, MapPinOffIcon, UserRoundXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { PlaceBadge } from "@/features/places";
import { cn } from "@/lib/utils";
import { TASK_TYPES, onDutyIds, type Task, type TaskViewer } from "../types/tasks";
import { DAY_GROUPS, dayGroupOf, groupByDay, groupByPlace, type TaskGrouping, type TaskListEntry } from "../types/task-views";
import { TaskRow } from "./task-row";
import { TASK_TYPE_ICONS } from "./task-type-icons";

type TaskListProps = {
  /** Already filtered and sorted. */
  tasks: Task[];
  /** Closed today (already filtered): shown struck through in their day group when grouping by due date. */
  completed?: Extract<TaskListEntry, { done: true }>[];
  grouping: TaskGrouping;
  today: string;
  habitants: Habitant[];
  viewer: TaskViewer;
  /** Route that handles quick actions; defaults to the current one. */
  action?: string;
  onChanged?: () => void;
  /** Filters under the search field (the tasks page's who/type/place/grouping controls). */
  toolbar?: React.ReactNode;
  /** A toolbar filter is active (nothing left then shows `noMatchesState`). */
  filtered?: boolean;
  /** Nothing to show at all. */
  emptyState?: React.ReactNode;
  /** The filters (not the search) leave nothing, e.g. with a "Clear filters" button. */
  noMatchesState?: React.ReactNode;
  /** Reloading: keeps showing the list, faded. */
  pending?: boolean;
  /** Group the due-date view by day (off for done tasks, which are listed newest first). */
  groupByDueDay?: boolean;
};

const NONE = "none";

/** "Overdue" in red while something in it is still open. */
function DayTitle({ label, danger }: { label: string; danger: boolean }) {
  return <span className={cn(danger && "text-destructive")}>{label}</span>;
}

/**
 * The tasks as a `GeneralList` (search, list/tiles): by due day (overdue, today, tomorrow, this week, later,
 * no date; with what was closed today struck through and a done count and bar per day), by place (floor by
 * floor, outside last), by type or by who is on duty (a shared task shows for each).
 */
export function TaskList({
  tasks,
  grouping,
  completed = [],
  today,
  habitants,
  viewer,
  action,
  onChanged,
  toolbar,
  filtered = false,
  emptyState,
  noMatchesState,
  pending = false,
  groupByDueDay = true,
}: TaskListProps) {
  const { t } = useTranslation("tasks");
  const [query, setQuery] = React.useState("");
  const habitantsById = new Map(habitants.map((habitant) => [habitant.id, habitant]));

  const byDay = grouping === "due" && groupByDueDay;
  const entries: TaskListEntry[] = byDay
    ? groupByDay(tasks, completed, today).flatMap((group) => group.entries)
    : tasks.map((task) => ({ key: task.id, task, done: false }));

  const placeOrder = React.useMemo(() => {
    const { floors } = groupByPlace(tasks);
    return [...floors.flatMap((floor) => floor.places.map((group) => group.place.id)), NONE];
  }, [tasks]);
  const placesById = new Map(tasks.flatMap((task) => (task.place ? [[task.place.id, task.place] as const] : [])));

  const grouped = (() => {
    switch (grouping) {
      case "due":
        if (!byDay) return {};
        return {
          groupBy: (entry: TaskListEntry) =>
            dayGroupOf(entry.done ? (entry.completion.occurrenceDate ?? entry.task.dueDate) : entry.task.dueDate, today),
          groupOrder: DAY_GROUPS,
          renderGroupHeader: (key: string, items: TaskListEntry[]) => (
            <DayTitle label={t(`groups.day.${key}`)} danger={key === "overdue" && items.some((entry) => !entry.done)} />
          ),
          renderGroupActions: (_key: string, items: TaskListEntry[]) => {
            const done = items.filter((entry) => entry.done).length;
            return (
              <span className="text-sm text-muted-foreground tabular-nums">
                {done > 0 ? t("progress.group", { done, total: items.length }) : t("progress.open", { count: items.length })}
              </span>
            );
          },
          renderGroupIntro: (_key: string, items: TaskListEntry[]) => {
            const done = items.filter((entry) => entry.done).length;
            if (done === 0) return null;
            const label = t("progress.group", { done, total: items.length });
            return <Progress value={(done / items.length) * 100} label={label} className="h-1" />;
          },
        };
      case "place":
        return {
          groupBy: (entry: TaskListEntry) => entry.task.place?.id ?? NONE,
          groupOrder: placeOrder,
          renderGroupHeader: (key: string) => {
            const place = placesById.get(key);
            if (!place) {
              return (
                <span className="inline-flex items-center gap-2">
                  <MapPinOffIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("groups.noPlace")}
                </span>
              );
            }
            return <PlaceBadge place={place} floorName={place.floorName} className="text-sm" />;
          },
        };
      case "type":
        return {
          groupBy: (entry: TaskListEntry) => entry.task.type,
          groupOrder: TASK_TYPES,
          renderGroupHeader: (key: string) => {
            const Icon = TASK_TYPE_ICONS[key as (typeof TASK_TYPES)[number]];
            return (
              <span className="inline-flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {t(`groups.type.${key}`)}
              </span>
            );
          },
        };
      case "assignee":
        return {
          // A shared task shows for everyone on duty; a task nobody is on duty for shows as unassigned.
          groupBy: (entry: TaskListEntry) => {
            const ids = onDutyIds(entry.task);
            return ids.length > 0 ? ids : NONE;
          },
          groupOrder: [...habitants.map((habitant) => habitant.id), NONE],
          renderGroupHeader: (key: string) => {
            const habitant = habitantsById.get(key);
            return (
              <span className="inline-flex items-center gap-2">
                {habitant ? <HabitantAvatar habitant={habitant} size="sm" /> : <UserRoundXIcon className="size-4" aria-hidden="true" />}
                {habitant?.name ?? t("groups.unassigned")}
              </span>
            );
          },
        };
    }
  })();

  // Places, types and people show how many each has.
  const countActions =
    grouping === "due"
      ? undefined
      : (_key: string, items: TaskListEntry[]) => <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>;

  const rowProps = { today, habitants, viewer, action, onChanged, hidePlace: grouping === "place" };

  return (
    <GeneralList<TaskListEntry>
      label={t("page.title")}
      items={entries}
      getKey={(entry) => entry.key}
      renderRow={(entry) => <TaskRow variant="plain" task={entry.task} completion={entry.completion} {...rowProps} />}
      renderTile={(entry) => <TaskRow variant="tile" task={entry.task} completion={entry.completion} {...rowProps} />}
      search={{
        query,
        onSearch: setQuery,
        keys: ({ task }) => [
          task.title,
          task.notes,
          task.place?.name,
          task.place?.floorName,
          t(`types.${task.type}`),
          task.project?.name,
          ...task.assigneeIds.map((id) => habitantsById.get(id)?.name),
        ],
      }}
      storageKey="tasks"
      defaultView="list"
      toolbar={toolbar}
      filtered={filtered}
      pending={pending}
      emptyState={emptyState ?? <EmptyState icon={ListChecksIcon} title={t("empty.none.title")} description={t("empty.none.description")} />}
      // The filters left nothing: say so (with a way out); a search that finds nothing gets the standard state.
      noResultsState={query.trim() ? undefined : noMatchesState}
      renderGroupActions={countActions}
      {...grouped}
    />
  );
}
