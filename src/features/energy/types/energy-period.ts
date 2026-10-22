import { z } from "zod";
import { addDays, addMonthsClamped } from "@/types/dates";

/**
 * Periods of the energy overview. Pure calendar arithmetic on `YYYY-MM-DD`, shared by the API (which
 * buckets) and the screens (which navigate). Weeks start on Monday, as in Belgium.
 */

export const ENERGY_PERIODS = ["day", "week", "month", "year"] as const;
export const energyPeriodSchema = z.enum(ENERGY_PERIODS);
export type EnergyPeriod = z.infer<typeof energyPeriodSchema>;

/** Size of one bar in the period's time series. */
export const BUCKET_OF_PERIOD = { day: "hour", week: "day", month: "day", year: "month" } as const;
export type EnergyBucket = (typeof BUCKET_OF_PERIOD)[EnergyPeriod];

/** Monday = 0 … Sunday = 6. */
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** First day of the period that contains `date`. */
export function periodStart(period: EnergyPeriod, date: string): string {
  switch (period) {
    case "day":
      return date;
    case "week":
      return addDays(date, -weekdayIndex(date));
    case "month":
      return `${date.slice(0, 7)}-01`;
    case "year":
      return `${date.slice(0, 4)}-01-01`;
  }
}

/** The period containing `date` as `[from, to)`: `to` is the first day after it. */
export function periodRange(period: EnergyPeriod, date: string): { from: string; to: string } {
  const from = periodStart(period, date);
  const to =
    period === "day"
      ? addDays(from, 1)
      : period === "week"
        ? addDays(from, 7)
        : addMonthsClamped(from, period === "month" ? 1 : 12);
  return { from, to };
}

/** The previous (`-1`) or next (`1`) period, as the date of its first day. */
export function shiftPeriod(period: EnergyPeriod, date: string, steps: number): string {
  const from = periodStart(period, date);
  if (period === "day") return addDays(from, steps);
  if (period === "week") return addDays(from, steps * 7);
  return addMonthsClamped(from, steps * (period === "month" ? 1 : 12));
}

/**
 * Labels of every bucket in the period, in order, in local time: `YYYY-MM-DDTHH:MM` for hours,
 * `YYYY-MM-DD` for days and `YYYY-MM` for months. A day always has 24 hour labels (on DST days one hour is
 * empty or holds two hours of data).
 */
export function bucketLabels(period: EnergyPeriod, date: string): string[] {
  const { from, to } = periodRange(period, date);
  const bucket = BUCKET_OF_PERIOD[period];
  if (bucket === "hour") {
    return Array.from({ length: 24 }, (_, hour) => `${from}T${String(hour).padStart(2, "0")}:00`);
  }
  const labels: string[] = [];
  for (let day = from; day < to; day = bucket === "day" ? addDays(day, 1) : addMonthsClamped(day, 1)) {
    labels.push(bucket === "day" ? day : day.slice(0, 7));
  }
  return labels;
}
