import { addDays } from "@/types/dates";
import { weekdayIndex } from "@/types/recurrence";
import {
  TASK_LOCATIONS,
  TASK_TYPES,
  compareTasks,
  dueState,
  onDutyIds,
  taskLocation,
  type DueState,
  type Task,
  type TaskCompletedToday,
  type TaskLocation,
  type TaskPlace,
  type TaskType,
} from "./tasks";

/**
 * The tasks page's views, filters and groupings. Pure functions; the state lives in the URL
 * (`?view=ready&type=job&location=outside&group=place`), so a filtered list can be bookmarked or shared.
 */
export const TASK_VIEWS = ["mine", "all", "ready", "overdue", "done"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_GROUPINGS = ["due", "place", "type", "assignee"] as const;
export type TaskGrouping = (typeof TASK_GROUPINGS)[number];

export type TaskFilters = {
  view: TaskView;
  /** Only tasks this habitant is on duty for. */
  assignee: string | null;
  type: TaskType | null;
  /** Only when a place is set; tasks without a place match neither. */
  location: TaskLocation | null;
  place: string | null;
  group: TaskGrouping;
};

const pick = <T extends string>(values: readonly T[], value: string | null): T | null =>
  value && (values as readonly string[]).includes(value) ? (value as T) : null;

/**
 * Everything open, for everyone: the household's total list ("when it's all done, it's all done"). "Mine"
 * is one tap away. The parameter is kept so callers don't change when the default depends on the user again.
 */
export const defaultView = (_currentHabitantId?: string | null): TaskView => "all";

export function parseTaskFilters(params: URLSearchParams, currentHabitantId?: string | null): TaskFilters {
  const view = pick(TASK_VIEWS, params.get("view")) ?? defaultView(currentHabitantId);
  return {
    view: view === "mine" && !currentHabitantId ? "all" : view,
    assignee: params.get("assignee") || null,
    type: pick(TASK_TYPES, params.get("type")),
    location: pick(TASK_LOCATIONS, params.get("location")),
    place: params.get("place") || null,
    group: pick(TASK_GROUPINGS, params.get("group")) ?? "due",
  };
}

/** The URL for filters, leaving out defaults so the plain `/tasks` stays plain. */
export function taskFiltersToParams(filters: TaskFilters, currentHabitantId?: string | null): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.view !== defaultView(currentHabitantId)) params.set("view", filters.view);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.type) params.set("type", filters.type);
  if (filters.location) params.set("location", filters.location);
  if (filters.place) params.set("place", filters.place);
  if (filters.group !== "due") params.set("group", filters.group);
  return params;
}

type FilterContext = { today: string; currentHabitantId?: string | null };

/** Whether a task belongs to a view, before the other filters. */
export function inView(task: Task, view: TaskView, { today, currentHabitantId }: FilterContext): boolean {
  if (view === "done") return task.status !== "open";
  if (task.status !== "open") return false;
  switch (view) {
    case "mine":
      return Boolean(currentHabitantId && onDutyIds(task).includes(currentHabitantId));
    case "ready":
      return task.readiness === "ready";
    case "overdue":
      return dueState(task, today) === "overdue";
    case "all":
      return true;
  }
}

export function applyTaskFilters(tasks: Task[], filters: TaskFilters, context: FilterContext): Task[] {
  const result = tasks.filter(
    (task) =>
      inView(task, filters.view, context) &&
      (!filters.assignee || onDutyIds(task).includes(filters.assignee)) &&
      (!filters.type || task.type === filters.type) &&
      (!filters.location || taskLocation(task) === filters.location) &&
      (!filters.place || task.place?.id === filters.place),
  );
  // Done: most recently closed first. Otherwise most urgent first.
  return filters.view === "done"
    ? result.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))
    : result.sort(compareTasks);
}

/** How many open tasks each view would show (for the tab badges). */
export function viewCounts(tasks: Task[], context: FilterContext): Record<TaskView, number> {
  const counts = { mine: 0, all: 0, ready: 0, overdue: 0, done: 0 } satisfies Record<TaskView, number>;
  for (const task of tasks) for (const view of TASK_VIEWS) if (inView(task, view, context)) counts[view]++;
  return counts;
}

// ── The total list: by day, with today's progress ─────────────────────────────────────────────────────

/** Day groups of the default list. "This week" is the 7 days after today, minus tomorrow. */
export const DAY_GROUPS = ["overdue", "today", "tomorrow", "week", "later", "none"] as const;
export type DayGroupKey = (typeof DAY_GROUPS)[number];

export function dayGroupOf(date: string | null, today: string): DayGroupKey {
  if (!date) return "none";
  if (date < today) return "overdue";
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return date <= addDays(today, 7) ? "week" : "later";
}

/** One line of the list: an open task, or something closed today (shown struck through until tomorrow). */
export type TaskListEntry =
  | { key: string; task: Task; done: false; completion?: undefined }
  | { key: string; task: Task; done: true; completion: TaskCompletedToday };

export type DayGroup = {
  key: DayGroupKey;
  /** Open tasks first (most urgent first), then what was closed today. */
  entries: TaskListEntry[];
  done: number;
  total: number;
};

/** What was closed today, joined with its task and narrowed by the same filters as the open tasks. */
export function completedTodayEntries(
  tasks: Task[],
  completedToday: TaskCompletedToday[],
  filters: TaskFilters,
  { currentHabitantId }: FilterContext,
): Extract<TaskListEntry, { done: true }>[] {
  if (filters.view !== "all" && filters.view !== "mine") return [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const involves = (task: Task, completion: TaskCompletedToday, habitantId: string) =>
    completion.completedById === habitantId || task.assigneeIds.includes(habitantId);
  return completedToday.flatMap((completion) => {
    const task = byId.get(completion.taskId);
    if (!task) return [];
    const keep =
      (filters.view !== "mine" || Boolean(currentHabitantId && involves(task, completion, currentHabitantId))) &&
      (!filters.assignee || involves(task, completion, filters.assignee)) &&
      (!filters.type || task.type === filters.type) &&
      (!filters.location || taskLocation(task) === filters.location) &&
      (!filters.place || task.place?.id === filters.place);
    return keep ? [{ key: `done:${completion.completionId}`, task, done: true as const, completion }] : [];
  });
}

/**
 * The default list: open tasks by due day (overdue, today, tomorrow, this week, later, no date), each
 * group with what was closed today for that day, and a done/total count per group.
 */
export function groupByDay(open: Task[], completed: Extract<TaskListEntry, { done: true }>[], today: string): DayGroup[] {
  return DAY_GROUPS.map((key) => {
    const openEntries: TaskListEntry[] = open
      .filter((task) => task.status === "open" && dayGroupOf(task.dueDate, today) === key)
      .sort(compareTasks)
      .map((task) => ({ key: task.id, task, done: false }));
    const doneEntries = completed
      .filter((entry) => dayGroupOf(entry.completion.occurrenceDate ?? entry.task.dueDate, today) === key)
      .sort((a, b) => a.completion.completedAt.localeCompare(b.completion.completedAt));
    return { key, entries: [...openEntries, ...doneEntries], done: doneEntries.length, total: openEntries.length + doneEntries.length };
  }).filter((group) => group.total > 0);
}

export type TodayProgress = {
  /** Closed today. */
  done: number;
  /** Closed today plus what is still open for today (overdue included). */
  total: number;
  /** Nothing overdue or due today is left. */
  allDoneToday: boolean;
  /** Nothing open at all. */
  allDone: boolean;
};

/** "3 of 5 done today", and whether everything for today (or everything at all) is done. */
export function todayProgress(open: Task[], completed: readonly unknown[], today: string): TodayProgress {
  const stillOpen = open.filter((task) => task.status === "open");
  const forToday = stillOpen.filter((task) => {
    const group = dayGroupOf(task.dueDate, today);
    return group === "overdue" || group === "today";
  }).length;
  return {
    done: completed.length,
    total: completed.length + forToday,
    allDoneToday: forToday === 0,
    allDone: stillOpen.length === 0,
  };
}

// ── Groupings ─────────────────────────────────────────────────────────────────────────────────────────

export const DUE_GROUPS = ["overdue", "today", "soon", "later", "none"] as const satisfies readonly DueState[];

export type DueGroup = { key: DueState; tasks: Task[] };

export function groupByDue(tasks: Task[], today: string): DueGroup[] {
  return DUE_GROUPS.map((key) => ({ key, tasks: tasks.filter((task) => dueState(task, today) === key) })).filter(
    (group) => group.tasks.length > 0,
  );
}

export type PlaceGroup = { place: TaskPlace; tasks: Task[] };
export type FloorGroup = { floorId: string; floorName: string; outside: boolean; places: PlaceGroup[] };

/**
 * Per place, grouped by floor: indoor floors from the bottom up, then outside. Tasks without a place
 * are returned separately.
 */
export function groupByPlace(tasks: Task[]): { floors: FloorGroup[]; unplaced: Task[] } {
  const floors = new Map<string, FloorGroup & { level: number }>();
  const unplaced: Task[] = [];
  for (const task of tasks) {
    const place = task.place;
    if (!place) {
      unplaced.push(task);
      continue;
    }
    let floor = floors.get(place.floorId);
    if (!floor) {
      floor = { floorId: place.floorId, floorName: place.floorName, outside: place.kind === "zone", level: place.floorLevel, places: [] };
      floors.set(place.floorId, floor);
    }
    let group = floor.places.find((candidate) => candidate.place.id === place.id);
    if (!group) {
      group = { place, tasks: [] };
      floor.places.push(group);
    }
    group.tasks.push(task);
  }
  const sorted = [...floors.values()].sort(
    (a, b) => Number(a.outside) - Number(b.outside) || a.level - b.level || a.floorName.localeCompare(b.floorName),
  );
  for (const floor of sorted) floor.places.sort((a, b) => a.place.name.localeCompare(b.place.name));
  return { floors: sorted.map(({ level: _level, ...floor }) => floor), unplaced };
}

export type TypeGroup = { type: TaskType; tasks: Task[] };

/** Per task type, in the order of `TASK_TYPES`. */
export function groupByType(tasks: Task[]): TypeGroup[] {
  return TASK_TYPES.map((type) => ({ type, tasks: tasks.filter((task) => task.type === type) })).filter(
    (group) => group.tasks.length > 0,
  );
}

export type AssigneeGroup = { habitantId: string | null; tasks: Task[] };

/** Per habitant on duty (in the given habitant order), then unassigned. A shared task shows for each. */
export function groupByAssignee(tasks: Task[], habitantIds: string[]): AssigneeGroup[] {
  const groups: AssigneeGroup[] = habitantIds.map((habitantId) => ({
    habitantId,
    tasks: tasks.filter((task) => onDutyIds(task).includes(habitantId)),
  }));
  groups.push({ habitantId: null, tasks: tasks.filter((task) => task.assigneeIds.length === 0) });
  return groups.filter((group) => group.tasks.length > 0);
}

// ── Snooze ────────────────────────────────────────────────────────────────────────────────────────────

export const SNOOZE_OPTIONS = ["tomorrow", "threeDays", "weekend", "nextWeek"] as const;
export type SnoozeOption = (typeof SNOOZE_OPTIONS)[number];

/** The new due date for a snooze choice. "Weekend" is the next Saturday after today. */
export function snoozeDate(option: SnoozeOption, today: string): string {
  switch (option) {
    case "tomorrow":
      return addDays(today, 1);
    case "threeDays":
      return addDays(today, 3);
    case "nextWeek":
      return addDays(today, 7);
    case "weekend": {
      const untilSaturday = (5 - weekdayIndex(today) + 7) % 7 || 7;
      return addDays(today, untilSaturday);
    }
  }
}
