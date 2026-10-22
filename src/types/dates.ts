/**
 * Calendar-date helpers for `YYYY-MM-DD` strings. Pure and time-zone safe: all arithmetic happens on UTC
 * midnight, so a date never shifts by a day because of the machine's local zone or DST.
 */

/** The household's time zone; "today" is always computed in it. */
export const HOUSEHOLD_TIME_ZONE = "Europe/Brussels";

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const fromUtc = (date: Date) => date.toISOString().slice(0, 10);

/** Today's date in the given time zone (default: the household's), as `YYYY-MM-DD`. */
export function todayIn(timeZone: string = HOUSEHOLD_TIME_ZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const value = toUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtc(value);
}

const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/**
 * Adds whole months. A day that doesn't exist in the target month clamps to its last day
 * (31 January + 1 month = 28/29 February), which is how banks and utilities schedule payments.
 */
export function addMonthsClamped(date: string, months: number): string {
  const value = toUtc(date);
  const day = value.getUTCDate();
  const target = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
  return fromUtc(target);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** `YYYY-MM` of a date. */
export const monthOf = (date: string) => date.slice(0, 7);
