import type { DashboardData } from "@/features/dashboard";
import type { ShoppingSummary } from "@/features/shopping";
import type { TasksSummary } from "@/features/tasks";
import { compareTasks } from "@/features/tasks/types/tasks";
import { HOUSEHOLD_TIME_ZONE, addDays, todayIn } from "@/types/dates";
import { TODAY as CALENDAR_TODAY, octoberAgenda } from "../calendar/fixtures";
import { emptySummaryFixture, gasMonthSummaryFixture, monthSummaryFixture } from "../energy/fixtures";
import { emptyExpensesSummaryFixture, expensesSummaryFixture } from "../expenses/fixtures";
import { householdOverviewFixture } from "../household/fixtures";
import { moneySummaryFixture, noAccountsMoneySummaryFixture } from "../money/fixtures";
import { itemListFixture } from "../shopping/fixtures";
import { tasksOverviewFixture, tasksToday } from "../tasks/fixtures";
import { unconfiguredWasteSummaryFixture, wasteSummaryFixture } from "../waste/fixtures";
import { noLocationWeatherFixture, weatherFixture } from "../weather/fixtures";

/** Every feature's fixtures are pinned to the same day. */
export const dashboardToday = tasksToday;
if (CALENDAR_TODAY !== dashboardToday) throw new Error("Dashboard fixtures expect all features on the same day");

/** Evening of the fixture day, local time. */
export const dashboardNow = new Date(`${dashboardToday}T19:30:00`);

const open = tasksOverviewFixture.tasks.filter((task) => task.status === "open").sort(compareTasks);
const soon = addDays(dashboardToday, 7);

/** What `GET /api/tasks/summary` returns for the task fixtures. */
export const tasksSummaryFixture: TasksSummary = {
  today: dashboardToday,
  open: open.length,
  overdue: open.filter((task) => task.dueDate !== null && task.dueDate < dashboardToday).length,
  dueToday: open.filter((task) => task.dueDate === dashboardToday).length,
  ready: open.filter((task) => task.readiness === "ready").length,
  waiting: open.filter((task) => task.readiness === "waiting").length,
  mine: 2,
  doneToday: 2,
  upcoming: open.filter((task) => task.dueDate !== null && task.dueDate <= soon).slice(0, 5),
};

const openItems = itemListFixture.filter((item) => item.status === "open");
export const shoppingSummaryFixture: ShoppingSummary = {
  open: openItems.length,
  shops: new Set(openItems.flatMap((item) => (item.shopId ? [item.shopId] : []))).size,
};

const zonedDate = (instant: string) => todayIn(HOUSEHOLD_TIME_ZONE, new Date(instant));

/** The calendar fixtures' entries on the fixture day, as `GET /api/calendar/agenda?from=today&to=today`. */
export const todayAgendaFixture = {
  ...octoberAgenda,
  from: dashboardToday,
  to: dashboardToday,
  entries: octoberAgenda.entries.filter((entry) =>
    entry.allDay
      ? entry.start <= dashboardToday && entry.end >= dashboardToday
      : zonedDate(entry.start) <= dashboardToday && zonedDate(new Date(Date.parse(entry.end) - 1).toISOString()) >= dashboardToday,
  ),
};

export const dashboardFixture: DashboardData = {
  today: dashboardToday,
  household: householdOverviewFixture,
  tasks: tasksSummaryFixture,
  shopping: shoppingSummaryFixture,
  expenses: expensesSummaryFixture,
  agenda: todayAgendaFixture,
  // Electricity with the same month's gas, as `fetchCurrentEnergySummary` returns it.
  energy: { ...monthSummaryFixture, gas: gasMonthSummaryFixture },
  weather: weatherFixture,
  waste: wasteSummaryFixture,
  money: moneySummaryFixture,
};

/** A new household: nothing planned, nothing measured. */
export const emptyDashboardFixture: DashboardData = {
  ...dashboardFixture,
  tasks: { ...tasksSummaryFixture, open: 0, overdue: 0, dueToday: 0, ready: 0, waiting: 0, mine: 0, doneToday: 0, upcoming: [] },
  shopping: { open: 0, shops: 0 },
  expenses: emptyExpensesSummaryFixture,
  agenda: { ...todayAgendaFixture, entries: [], events: [] },
  energy: { ...emptySummaryFixture, gas: null },
  weather: noLocationWeatherFixture,
  waste: unconfiguredWasteSummaryFixture,
  money: noAccountsMoneySummaryFixture,
};

/** Some requests failed: their cards show an error, the rest still renders. */
export const partlyFailedDashboardFixture: DashboardData = {
  ...dashboardFixture,
  shopping: null,
  agenda: null,
  expenses: null,
  energy: null,
  weather: null,
  money: null,
};
