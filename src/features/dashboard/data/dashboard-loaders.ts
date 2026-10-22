import { fetchAgenda, type CalendarAgenda } from "@/features/calendar";
import { optionalData } from "@/lib/loaders";
import { fetchCurrentEnergySummary } from "@/features/energy";
import { fetchExpensesSummary, type ExpensesSummary } from "@/features/expenses";
import { fetchHouseholdOverview, type HouseholdOverview } from "@/features/household";
import { fetchMoneySummary, type MoneySummary } from "@/features/money";
import { fetchShoppingSummary, type ShoppingSummary } from "@/features/shopping";
import { fetchTasksSummary, type TasksSummary } from "@/features/tasks";
import { fetchWasteSummary, type WasteSummary } from "@/features/waste";
import { fetchWeather, type WeatherResponse } from "@/features/weather";
import { todayIn } from "@/types/dates";
import type { DashboardEnergy } from "./dashboard-items";

/** One card's data, or `null` when its request failed: that card shows an error, the rest still renders. */
export type DashboardSlice<T> = T | null;

/** The dashboard's data once everything has loaded (fixtures and stories use this shape). */
export type DashboardData = {
  /** Today in the household time zone, `YYYY-MM-DD`. */
  today: string;
  household: DashboardSlice<HouseholdOverview>;
  tasks: DashboardSlice<TasksSummary>;
  shopping: DashboardSlice<ShoppingSummary>;
  /** Unpaid expenses in the next two weeks (overdue included) and the monthly recurring total. */
  expenses: DashboardSlice<ExpensesSummary>;
  /** Today's calendar entries (events and overlays). */
  agenda: DashboardSlice<CalendarAgenda>;
  /**
   * This month, with a daily series (today's figure comes from it). Gas comes along under `gas`; a failing
   * gas request makes that `null` and only hides the gas figures.
   */
  energy: DashboardSlice<DashboardEnergy>;
  /** The home's forecast (or why there is none). */
  weather: DashboardSlice<WeatherResponse>;
  /** The next waste collections. */
  waste: DashboardSlice<WasteSummary>;
  /** This month in and out, and the joint account balances. */
  money: DashboardSlice<MoneySummary>;
};

type Slices = Omit<DashboardData, "today">;

/**
 * What the loader returns: `today` right away and one un-awaited promise per card, so the page renders
 * at once and every card fills in with its own skeleton. Each promise resolves to `null` instead of
 * rejecting. The screen also accepts plain values (stories, tests).
 */
export type DeferredDashboardData = { today: string } & { [K in keyof Slices]: Promise<Slices[K]> };

/** Either shape: every slice may still be loading. */
export type DashboardScreenData = { today: string } & { [K in keyof Slices]: Slices[K] | Promise<Slices[K]> };

const settle = <T>(promise: Promise<T>) => optionalData(promise, "Dashboard: a card");

/** Starts every card's request in parallel and returns without waiting; a failing request only empties its own card. */
export function dashboardLoader(): DeferredDashboardData {
  const today = todayIn();
  return {
    today,
    household: settle(fetchHouseholdOverview()),
    tasks: settle(fetchTasksSummary()),
    shopping: settle(fetchShoppingSummary()),
    expenses: settle(fetchExpensesSummary()),
    agenda: settle(fetchAgenda({ from: today, to: today })),
    energy: settle(fetchCurrentEnergySummary("month")),
    weather: settle(fetchWeather()),
    waste: settle(fetchWasteSummary()),
    money: settle(fetchMoneySummary()),
  };
}
