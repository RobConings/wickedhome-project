import { CircleCheckBigIcon, ListChecksIcon, PartyPopperIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import type { Habitant } from "@/features/household";
import type { Place } from "@/features/places";
import { useOpenFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import { TaskFilterControls, TaskViewTabs } from "../components/task-filters-bar";
import { TaskFormDialog, type TaskProjectField } from "../components/task-form-dialog";
import { TaskList } from "../components/task-list";
import { TaskTodayProgress } from "../components/task-today-progress";
import {
  applyTaskFilters,
  completedTodayEntries,
  dayGroupOf,
  parseTaskFilters,
  taskFiltersToParams,
  todayProgress,
  viewCounts,
  type TaskFilters,
} from "../types/task-views";
import type { TasksOverview, TaskViewer } from "../types/tasks";

type TasksScreenProps = {
  overview: TasksOverview;
  habitants: Habitant[];
  places: Place[];
  /** Adults and owners manage tasks; children complete the ones assigned to them. */
  canManage: boolean;
  /** The logged-in user's habitant: "Mine" and who completes by default. */
  currentHabitantId?: string | null;
  /** Optional "Project" field in the task form, composed by the route. */
  projectField?: TaskProjectField;
};

/**
 * The household's total list: everything open from every source (chores, to-dos, jobs, maintenance,
 * errands, bins and other linked tasks), by day, with today's progress and an "All done" moment. Views
 * and filters live in the URL.
 */
export function TasksScreen({ overview, habitants, places, canManage, currentHabitantId, projectField }: TasksScreenProps) {
  const { t } = useTranslation("tasks");
  // Filters apply in the browser; this covers reloads (after a change elsewhere, or live updates).
  const pending = useSamePagePending();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseTaskFilters(searchParams, currentHabitantId);
  const context = { today: overview.today, currentHabitantId };
  const tasks = applyTaskFilters(overview.tasks, filters, context);
  const counts = viewCounts(overview.tasks, context);
  // Today's progress follows who/type/place, and "Mine" when chosen; the other views show everything's.
  const progressFilters: TaskFilters = { ...filters, view: filters.view === "mine" ? "mine" : "all" };
  const progressTasks = filters.view === progressFilters.view ? tasks : applyTaskFilters(overview.tasks, progressFilters, context);
  const progressDone = completedTodayEntries(overview.tasks, overview.completedToday, progressFilters, context);
  const progress = todayProgress(progressTasks, progressDone, overview.today);
  const overdue = progressTasks.filter((task) => task.status === "open" && dayGroupOf(task.dueDate, overview.today) === "overdue").length;
  const completed = filters.group === "due" ? completedTodayEntries(overview.tasks, overview.completedToday, filters, context) : [];
  const viewer: TaskViewer = { habitantId: currentHabitantId ?? null, canManage };
  const placeName = filters.place ? (places.find((place) => place.id === filters.place)?.name ?? null) : null;

  // `?new=1` (dashboard, a place page) opens the form, with `place` pre-filled; the param is removed at once.
  const [creating, setCreating] = useOpenFromUrl(canManage);

  const setFilters = (next: TaskFilters) =>
    setSearchParams(taskFiltersToParams(next, currentHabitantId), { replace: true, preventScrollReset: true });

  const addButton = canManage && (
    <TaskFormDialog
      habitants={habitants}
      places={places}
      today={overview.today}
      defaults={{ type: filters.type ?? undefined, placeId: filters.place, assigneeIds: filters.assignee ? [filters.assignee] : [] }}
      projectField={projectField}
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.add")}
        </Button>
      }
    />
  );

  // Nothing at all to filter means "no tasks yet", whatever the filters say.
  const filtered = overview.tasks.length > 0 && Boolean(filters.assignee || filters.type || filters.location || filters.place);
  const empty =
    overview.tasks.length === 0
      ? { icon: ListChecksIcon, title: t("empty.none.title"), description: t("empty.none.description"), action: addButton }
      : filters.view === "done"
        ? { icon: CircleCheckBigIcon, title: t("empty.done.title"), description: t("empty.done.description") }
        : { icon: PartyPopperIcon, title: t(`empty.${filters.view}.title`), description: t(`empty.${filters.view}.description`) };

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={addButton} />
      {(overview.tasks.length > 0 || overview.completedToday.length > 0) && (
        <TaskTodayProgress progress={progress} overdue={overdue} openTotal={progressTasks.length} />
      )}

      <TaskViewTabs filters={filters} onChange={setFilters} counts={counts} showMine={Boolean(currentHabitantId)} />

      <TaskList
        tasks={tasks}
        completed={completed}
        grouping={filters.group}
        groupByDueDay={filters.view !== "done"}
        today={overview.today}
        habitants={habitants}
        viewer={viewer}
        pending={pending}
        toolbar={<TaskFilterControls filters={filters} onChange={setFilters} habitants={habitants} placeName={placeName} />}
        filtered={filtered}
        emptyState={<EmptyState icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />}
        noMatchesState={
          <EmptyState
            icon={SearchXIcon}
            title={t("empty.filtered.title")}
            description={t("empty.filtered.description")}
            action={
              <Button variant="outline" onClick={() => setFilters({ ...filters, assignee: null, type: null, location: null, place: null })}>
                {t("filters.clear")}
              </Button>
            }
          />
        }
      />

      {creating && (
        <TaskFormDialog
          habitants={habitants}
          places={places}
          today={overview.today}
          defaults={{ placeId: filters.place }}
          projectField={projectField}
          open
          onOpenChange={setCreating}
        />
      )}
    </PageContainer>
  );
}
