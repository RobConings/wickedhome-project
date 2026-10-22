import type { CalendarAgenda, CalendarEntryKind } from "@/features/calendar";
import type { EnergySummary } from "@/features/energy";
import type { ExpensesSummary } from "@/features/expenses";
import type { TasksSummary } from "@/features/tasks";
import { formatTime } from "@/types/date-format";
import { HOUSEHOLD_TIME_ZONE, addDays } from "@/types/dates";

/**
 * Pure derivations from the dashboard's data: what goes on the timeline, what is coming up, and the
 * figures of the stat cards. No React, no translations, so they are easy to test.
 */

/** How far ahead "Upcoming" looks, in days after today. */
export const UPCOMING_DAYS = 14;
/** At most this many rows in "Upcoming". */
export const UPCOMING_LIMIT = 6;

// The paths of other features' detail pages. Kept here (not imported) so this file stays free of UI code.
const taskHref = (id: string) => `/tasks/${encodeURIComponent(id)}`;
const eventHref = (id: string) => `/calendar/events/${encodeURIComponent(id)}`;
const expenseHref = (id: string) => `/expenses/${encodeURIComponent(id)}`;

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: HOUSEHOLD_TIME_ZONE });
/** The household-zone date of an instant, `YYYY-MM-DD`. */
const zonedDate = (instant: string) => dateFormat.format(new Date(instant));

export type TodayItem = {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  /** "08:15" for a timed entry that starts today; `null` for all-day items. */
  time: string | null;
  /** A timed entry that began before today and is still going on. */
  ongoing: boolean;
  /** Location of an event, place of a task. */
  detail: string | null;
  /** Birthdays: the age reached. */
  age: number | null;
  href: string | null;
};

/**
 * Today's timeline: calendar entries plus tasks due today. Tasks are also a calendar overlay, so the
 * calendar's copies are dropped in favour of the tasks summary (which knows the place). All-day items
 * first, then by start time. Either source may be missing (failed to load).
 */
export function todayItems(today: string, agenda: CalendarAgenda | null, tasks: TasksSummary | null): TodayItem[] {
  const taskItems: TodayItem[] = (tasks?.upcoming ?? [])
    .filter((task) => task.dueDate === today)
    .map((task) => ({
      id: `task:${task.id}`,
      kind: "task",
      title: task.title,
      time: null,
      ongoing: false,
      detail: task.place?.name ?? null,
      age: null,
      href: taskHref(task.id),
    }));
  const taskHrefs = new Set(taskItems.map((item) => item.href));

  const entryItems: TodayItem[] = (agenda?.entries ?? [])
    .filter((entry) => !(entry.kind === "task" && entry.href && taskHrefs.has(entry.href)))
    .map((entry) => {
      const startsToday = entry.allDay || zonedDate(entry.start) === today;
      return {
        id: entry.key,
        kind: entry.kind,
        title: entry.title,
        time: !entry.allDay && startsToday ? formatTime(entry.start) : null,
        ongoing: !entry.allDay && !startsToday,
        detail: entry.location,
        age: typeof entry.meta?.age === "number" ? entry.meta.age : null,
        href: entry.href ?? (entry.eventId ? eventHref(entry.eventId) : null),
      };
    });

  const allDay = [...entryItems.filter((item) => item.time === null), ...taskItems];
  const timed = entryItems.filter((item) => item.time !== null).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return [...allDay, ...timed];
}

export type UpcomingItem = {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  kind: "bill" | "renewal" | "task";
  title: string;
  amountCents: number | null;
  /** The task's place. */
  detail: string | null;
  href: string;
};

/**
 * Unpaid expenses (one-off and recurring, kind "bill") and tasks in the days after today, soonest first.
 * Direct debits pay themselves, but they still show: money leaves the account.
 */
export function upcomingItems(
  today: string,
  sources: { expenses: ExpensesSummary | null; tasks: TasksSummary | null },
  { days = UPCOMING_DAYS, limit = UPCOMING_LIMIT }: { days?: number; limit?: number } = {},
): UpcomingItem[] {
  const last = addDays(today, days);
  const inWindow = (date: string | null): date is string => date !== null && date > today && date <= last;

  const expenses: UpcomingItem[] = (sources.expenses?.upcoming ?? [])
    .filter((expense) => !expense.paidOn && inWindow(expense.dueDate))
    .map((expense) => ({
      id: `expense:${expense.id}`,
      date: expense.dueDate,
      kind: "bill",
      title: expense.payee,
      amountCents: expense.amountCents,
      detail: null,
      href: expenseHref(expense.id),
    }));
  const tasks: UpcomingItem[] = (sources.tasks?.upcoming ?? [])
    .filter((task) => inWindow(task.dueDate))
    .map((task) => ({
      id: `task:${task.id}`,
      date: task.dueDate ?? today,
      kind: "task",
      title: task.title,
      amountCents: null,
      detail: task.place?.name ?? null,
      href: taskHref(task.id),
    }));

  return [...expenses, ...tasks]
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Expenses stat: unpaid expenses due within the coming week, what is overdue, and the monthly recurring total. */
export function expensesDueThisWeek(summary: ExpensesSummary) {
  return {
    count: summary.dueThisWeek.count,
    totalCents: summary.dueThisWeek.totalCents,
    overdue: summary.overdue.count,
    recurringMonthlyCents: summary.recurring.monthlyCents,
  };
}

export type EnergyFigures = {
  hasData: boolean;
  /** Home consumption today, or grid import when consumption is unknown. */
  todayWh: number | null;
  monthWh: number | null;
  /** Consumption is unknown (solar or battery not measured): the figures are grid import. */
  gridOnly: boolean;
  /** Share of consumption covered without the grid, 0…1, when solar is measured. */
  solarShare: number | null;
  peakKw: number | null;
};

/** What the energy card gets: this month's electricity summary, with gas under `gas` (`null`: it failed to load). */
export type DashboardEnergy = EnergySummary & { gas?: EnergySummary | null };

export type GasFigures = {
  /** Gas used today; null when today has no data yet. */
  todayWh: number | null;
  /** Today's volume in litres (m³ × 1000), when measured. */
  todayLitres: number | null;
  monthWh: number;
  monthLitres: number | null;
};

/**
 * The gas part of the energy card, or `null` when there is none to show: the household has no gas data
 * this month, or the gas summary failed to load (then only the gas part is hidden).
 */
export function gasFigures(gas: EnergySummary | null | undefined, today: string): GasFigures | null {
  if (!gas?.status.hasGridData) return null;
  const point = gas.series.find((entry) => entry.label === today);
  return {
    todayWh: point ? (point.consumptionWh ?? point.importWh) : null,
    todayLitres: point?.volumeLitres ?? null,
    monthWh: gas.totals.consumptionWh ?? gas.totals.importWh,
    monthLitres: gas.totals.volumeLitres,
  };
}

/** The energy card's figures from this month's summary. */
export function energyFigures(summary: EnergySummary, today: string): EnergyFigures {
  const { totals, status, series, peak } = summary;
  const gridOnly = totals.consumptionWh === null;
  const point = series.find((entry) => entry.label === today);
  return {
    hasData: status.hasGridData,
    todayWh: point ? (point.consumptionWh ?? point.importWh) : null,
    monthWh: totals.consumptionWh ?? totals.importWh,
    gridOnly,
    solarShare: status.hasSolar && status.solarMeasured ? totals.selfSufficiency : null,
    peakKw: peak.kw,
  };
}
