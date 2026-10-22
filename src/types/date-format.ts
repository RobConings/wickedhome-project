import type { Locale } from "@/types/common";
import { HOUSEHOLD_TIME_ZONE, todayIn } from "@/types/dates";

/*
 * The one way dates are rendered, in the browser, the API (notifications, task titles, assistant tools) and
 * shared feature contracts alike. Belgian convention in both languages: numeric day/month/year,
 * "30/10/2026", and 24-hour times, "30/10/2026 14:05". Only a weekday prefix ("za 03/10/2026") and month
 * headers ("oktober 2026") use words. Pure and time-zone safe:
 *
 * - A calendar date (`YYYY-MM-DD`) is shown as it is, never shifted by a time zone.
 * - An instant (ISO date-time string or `Date`) is shown on the household's wall clock (Europe/Brussels)
 *   unless another `timeZone` is given.
 *
 * Compact forms stay where they are needed (calendar grid day numbers, chart ticks, relative words such as
 * "today"); every concrete date annotation goes through `formatDate` / `formatDateTime`.
 */

const INTL: Record<Locale, string> = { en: "en-BE", nl: "nl-BE" };

/** No-break spaces Intl puts in some output; plain spaces read the same everywhere (notifications too). */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (text: string) => text.replace(NO_BREAK_SPACES, " ");

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateValue = string | Date;

type Parts = { year: string; month: string; day: string; hour: string; minute: string; weekdayDate: Date };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Year, month, day (and the time of an instant) of a value, on the wall clock of `timeZone`. */
function partsOf(value: DateValue, timeZone: string): Parts | null {
  if (typeof value === "string") {
    const match = CALENDAR_DATE.exec(value);
    if (match) {
      const [, year = "", month = "", day = ""] = match;
      return { year, month, day, hour: "00", minute: "00", weekdayDate: new Date(`${value}T12:00:00Z`) };
    }
  }
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(instant).map((part) => [part.type, part.value]));
  const year = parts.year ?? "";
  const month = parts.month ?? "";
  const day = parts.day ?? "";
  return { year, month, day, hour: parts.hour ?? "00", minute: parts.minute ?? "00", weekdayDate: new Date(`${year}-${month}-${day}T12:00:00Z`) };
}

export type DateFormatOptions = {
  /** Prefix the weekday: "za 03/10/2026" / "Sat 03/10/2026" (only where a weekday was deliberately shown). */
  weekday?: "short" | "long";
  /** Wall clock of an instant (default Europe/Brussels). Calendar dates ignore it. */
  timeZone?: string;
};

/** The weekday of a value: "za" / "Sat" (short), "zaterdag" / "Saturday" (long) or "Z" / "S" (narrow). */
export function formatWeekday(
  value: DateValue,
  locale: Locale,
  width: "narrow" | "short" | "long" = "short",
  timeZone: string = HOUSEHOLD_TIME_ZONE,
): string {
  const parts = partsOf(value, timeZone);
  if (!parts) return "";
  return plain(new Intl.DateTimeFormat(INTL[locale], { weekday: width, timeZone: "UTC" }).format(parts.weekdayDate)).replace(/\.$/, "");
}

/**
 * A date as dd/mm/yyyy: "30/10/2026"; with `weekday`, "vr 30/10/2026". A `YYYY-MM-DD` string is a calendar
 * date; anything else is an instant shown in Brussels. Invalid input gives "".
 */
export function formatDate(value: DateValue, locale: Locale, options: DateFormatOptions = {}): string {
  const parts = partsOf(value, options.timeZone ?? HOUSEHOLD_TIME_ZONE);
  if (!parts) return "";
  const date = `${parts.day}/${parts.month}/${parts.year}`;
  return options.weekday ? `${formatWeekday(value, locale, options.weekday, options.timeZone)} ${date}` : date;
}

/** A 24-hour wall-clock time: "14:05" (an instant, in Brussels unless `timeZone` says otherwise). */
export function formatTime(value: DateValue, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  const parts = partsOf(value, timeZone);
  return parts ? `${parts.hour}:${parts.minute}` : "";
}

/** A date and 24-hour time: "30/10/2026 14:05"; with `weekday`, "vr 30/10/2026 14:05". */
export function formatDateTime(value: DateValue, locale: Locale, options: DateFormatOptions = {}): string {
  const date = formatDate(value, locale, options);
  return date ? `${date} ${formatTime(value, options.timeZone)}` : "";
}

/** A month header: "oktober 2026" / "October 2026" (`YYYY-MM`, or any date in it). */
export function formatMonth(month: string, locale: Locale, width: "long" | "short" = "long"): string {
  const date = new Date(`${month.slice(0, 7)}-15T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return plain(new Intl.DateTimeFormat(INTL[locale], { month: width, year: "numeric", timeZone: "UTC" }).format(date));
}

/** A month name without year: "oktober" / "Oct" (chart ticks, recurrence texts). */
export function formatMonthName(month: number, locale: Locale, width: "long" | "short" | "narrow" = "long"): string {
  const date = new Date(Date.UTC(2026, Math.min(12, Math.max(1, month)) - 1, 15, 12));
  return plain(new Intl.DateTimeFormat(INTL[locale], { month: width, timeZone: "UTC" }).format(date)).replace(/\.$/, "");
}

/** A date range: "28/09/2026 – 04/10/2026" (one date when both are the same). */
export function formatDateRange(from: DateValue, to: DateValue, locale: Locale): string {
  const start = formatDate(from, locale);
  const end = formatDate(to, locale);
  return start === end ? start : `${start} – ${end}`;
}

/**
 * A compact range of calendar dates for tight rows: "12/10 – 14/10" when both are in `year` (default: this year
 * in Brussels), otherwise the full "28/12/2026 – 02/01/2027". Still day first; only the year is left out.
 */
export function formatShortDateRange(from: string, to: string, locale: Locale, year: string = todayIn().slice(0, 4)): string {
  const short = (date: string) => {
    const parts = partsOf(date, HOUSEHOLD_TIME_ZONE);
    return parts ? `${parts.day}/${parts.month}` : "";
  };
  if (from.slice(0, 4) !== year || to.slice(0, 4) !== year) return formatDateRange(from, to, locale);
  return from === to ? short(from) : `${short(from)} – ${short(to)}`;
}
