import type { TFunction } from "i18next";
import type { Locale } from "@/types/common";
import {
  formatDate,
  formatDateRange,
  formatMonth,
  formatTime as formatClockTime,
  formatWeekday,
} from "@/types/date-format";
import { addDays } from "@/types/dates";
import { CALENDAR_ERROR_CODES, type CalendarEntry, type CalendarEvent } from "../types/calendar";
import { datesInRange, zonedParts, type DateRange } from "../types/calendar-time";

/**
 * Display helpers for the calendar, on top of `@/types/date-format`: concrete dates as dd/mm/yyyy (with the
 * weekday where it helps), 24-hour times in the household time zone. Only the grid's weekday column labels
 * and day numbers stay compact.
 */

/** "14:05": an instant on the household's wall clock. */
export const formatTime = (instant: string) => formatClockTime(instant);

/** "October 2026" / "oktober 2026". */
export const formatMonthTitle = (date: string, locale: Locale) => formatMonth(date, locale);

/** "28/09/2026 – 04/10/2026". */
export const formatRangeTitle = ({ from, to }: DateRange, locale: Locale) => formatDateRange(from, to, locale);

/** "Saturday 03/10/2026" / "zaterdag 03/10/2026". */
export const formatDayHeading = (date: string, locale: Locale) => formatDate(date, locale, { weekday: "long" });

/** Weekday names, Monday first (grid column labels). */
export function weekdayLabels(locale: Locale, width: "narrow" | "short" | "long" = "short"): string[] {
  // 2026-09-28 is a Monday.
  return datesInRange({ from: "2026-09-28", to: "2026-10-04" }).map((date) => formatWeekday(date, locale, width));
}

/** The household-zone dates an entry covers. A timed entry ending at midnight doesn't spill into the next day. */
export function entryDates(entry: Pick<CalendarEntry, "allDay" | "start" | "end">): DateRange {
  if (entry.allDay) return { from: entry.start, to: entry.end };
  const from = zonedParts(entry.start).date;
  const to = zonedParts(new Date(Math.max(Date.parse(entry.start), Date.parse(entry.end) - 1))).date;
  return { from, to };
}

/** Entries per date within `range`. A multi-day entry appears on every day it covers. */
export function groupEntriesByDate(entries: CalendarEntry[], range: DateRange): Map<string, CalendarEntry[]> {
  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const { from, to } = entryDates(entry);
    for (let date = from < range.from ? range.from : from; date <= to && date <= range.to; date = addDays(date, 1)) {
      const list = byDate.get(date);
      if (list) list.push(entry);
      else byDate.set(date, [entry]);
    }
  }
  return byDate;
}

/**
 * The time part of an entry on a given day: "08:15 – 08:45", "from 22:00", "until 01:00", or `null` for
 * all-day entries (and the middle days of long timed ones).
 */
export function formatEntryTime(entry: CalendarEntry, date: string, locale: Locale, t: TFunction): string | null {
  if (entry.allDay) return null;
  const { from, to } = entryDates(entry);
  const startsToday = from === date;
  const endsToday = to === date;
  if (startsToday && endsToday) return `${formatTime(entry.start)} – ${formatTime(entry.end)}`;
  if (startsToday) return t("calendar:time.from", { time: formatTime(entry.start) });
  if (endsToday) return t("calendar:time.until", { time: formatTime(entry.end) });
  return null;
}

/**
 * Full "when" line: "Saturday 10/10/2026 · 10:00 – 11:00", or a range for multi-day events,
 * "Fri 09/10/2026 – Sun 11/10/2026" / "Fri 09/10/2026 18:00 – Sun 11/10/2026 14:00".
 */
export function formatEventWhen(
  event: Pick<CalendarEvent, "allDay" | "startDate" | "endDate" | "startTime" | "endTime">,
  locale: Locale,
): string {
  const long = (date: string) => formatDate(date, locale, { weekday: "long" });
  const short = (date: string) => formatDate(date, locale, { weekday: "short" });
  if (event.allDay) {
    if (event.startDate === event.endDate) return long(event.startDate);
    return `${short(event.startDate)} – ${short(event.endDate)}`;
  }
  if (event.startDate === event.endDate) {
    return `${long(event.startDate)} · ${event.startTime} – ${event.endTime}`;
  }
  return `${short(event.startDate)} ${event.startTime} – ${short(event.endDate)} ${event.endTime}`;
}

/** The same, for one occurrence (an entry): uses the entry's own dates. */
export function formatEntryWhen(entry: CalendarEntry, locale: Locale): string {
  if (entry.allDay) {
    return formatEventWhen({ allDay: true, startDate: entry.start, endDate: entry.end, startTime: null, endTime: null }, locale);
  }
  const start = zonedParts(entry.start);
  const end = zonedParts(entry.end);
  return formatEventWhen(
    { allDay: false, startDate: start.date, endDate: end.date, startTime: start.time, endTime: end.time },
    locale,
  );
}

/** Display title: overlays may need the kind to read well, e.g. "Lena turns 10" for a birthday. */
export function entryTitle(entry: Pick<CalendarEntry, "kind" | "title" | "meta">, t: TFunction): string {
  const age = entry.meta?.age;
  if (entry.kind === "birthday" && typeof age === "number") return t("calendar:entry.birthday", { name: entry.title, age });
  return entry.title;
}

/** Start time of a timed entry when it starts on `date` ("08:15"), else `null`. */
export function startTimeOn(entry: Pick<CalendarEntry, "allDay" | "start" | "end">, date: string): string | null {
  if (entry.allDay || entryDates(entry).from !== date) return null;
  return formatTime(entry.start);
}

/** Translates the schema's own error codes (`CALENDAR_ERROR_CODES`); other messages pass through. */
export function translateErrors(messages: string[] | undefined, t: TFunction): string[] | undefined {
  return messages?.map((message) =>
    (CALENDAR_ERROR_CODES as readonly string[]).includes(message) ? t(`calendar:errors.${message}`) : message,
  );
}

/** Entries drawn as one bar across days: all-day entries over several days, timed ones of 24 hours or more. */
export function isMultiDay(entry: Pick<CalendarEntry, "allDay" | "start" | "end">): boolean {
  if (entry.allDay) return entry.end > entry.start;
  return Date.parse(entry.end) - Date.parse(entry.start) >= 24 * 60 * 60 * 1000;
}

/** Like `groupEntriesByDate`, but a multi-day entry appears once, on its first day within `range` (agenda). */
export function groupEntriesForAgenda(entries: CalendarEntry[], range: DateRange): Map<string, CalendarEntry[]> {
  const byDate = groupEntriesByDate(
    entries.filter((entry) => !isMultiDay(entry)),
    range,
  );
  for (const entry of entries.filter((candidate) => isMultiDay(candidate))) {
    const { from, to } = entryDates(entry);
    if (to < range.from || from > range.to) continue;
    const date = from < range.from ? range.from : from;
    byDate.set(date, [entry, ...(byDate.get(date) ?? [])]);
  }
  return new Map([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** "24/10/2026 – 31/10/2026": the household-zone days a (multi-day) entry covers. */
export function formatEntryDateRange(entry: CalendarEntry, locale: Locale): string {
  const { from, to } = entryDates(entry);
  return formatDateRange(from, to, locale);
}
