import { HOUSEHOLD_TIME_ZONE, addDays, addMonthsClamped } from "@/types/dates";

/**
 * Time-zone and calendar-grid helpers for the calendar. Pure (no React, no browser APIs), so the API and
 * the screens compute "which day is this event on" identically. Dates are `YYYY-MM-DD`, times `HH:MM`
 * (24 h), and every wall-clock value is in the household's time zone (Europe/Brussels). Weeks start on
 * Monday, as in Belgium.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(instant: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** Wall-clock date and time of an instant in the household time zone. */
export function zonedParts(
  instant: Date | string,
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): { date: string; time: string; minutes: number } {
  const time = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  const p = wallClock(time, timeZone);
  return {
    date: `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    minutes: p.hour * 60 + p.minute,
  };
}

/** Offset of the zone from UTC at an instant, in milliseconds (Brussels: +1 h in winter, +2 h in summer). */
function offsetAt(instant: number, timeZone: string): number {
  const p = wallClock(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` `time`. A time that doesn't exist (the
 * hour skipped when DST starts) moves forward by the gap; an ambiguous one (DST end) takes the second.
 */
export function zonedToUtc(date: string, time: string, timeZone: string = HOUSEHOLD_TIME_ZONE): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const guess = local - offsetAt(local, timeZone);
  const offset = offsetAt(guess, timeZone);
  return new Date(offset === local - guess ? guess : local - offset);
}

// ── Calendar grid ─────────────────────────────────────────────────────────────────────────────────────

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export const startOfWeek = (date: string) => addDays(date, -weekdayIndex(date));
export const startOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
export const endOfMonth = (date: string) => addDays(addMonthsClamped(startOfMonth(date), 1), -1);

export type DateRange = { from: string; to: string };

/** Monday to Sunday around `date`. */
export const weekRange = (date: string): DateRange => ({ from: startOfWeek(date), to: addDays(startOfWeek(date), 6) });

/** Whole weeks (Monday to Sunday) covering the month of `date`: what a month grid shows. */
export function monthGridRange(date: string): DateRange {
  return { from: startOfWeek(startOfMonth(date)), to: addDays(startOfWeek(endOfMonth(date)), 6) };
}

/** Every date from `from` to `to`, both inclusive. */
export function datesInRange({ from, to }: DateRange): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Whether two ranges share at least one day. */
export const rangesOverlap = (a: DateRange, b: DateRange) => a.from <= b.to && b.from <= a.to;
