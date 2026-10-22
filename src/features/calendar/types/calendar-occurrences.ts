import { addDays, daysBetween } from "@/types/dates";
import { occurrencesOf } from "@/types/recurrence";
import type { AgendaQuery, CalendarEntry, CalendarEvent } from "./calendar";
import { zonedParts, zonedToUtc } from "./calendar-time";

/**
 * Turns stored events into calendar entries for a date range: expands recurrence, keeps the wall-clock
 * time across DST changes, and includes multi-day occurrences that began before the range. Used by the
 * API (src/api/calendar) and by story fixtures.
 */

/** Occurrences of one event that overlap `from`–`to` (inclusive dates), as calendar entries. */
export function eventEntries(event: CalendarEvent, { from, to }: AgendaQuery): CalendarEntry[] {
  const durationDays = daysBetween(event.startDate, event.endDate);
  // Start looking `durationDays` earlier, so a multi-day occurrence that began before `from` still shows.
  const dates = occurrencesOf(event.rrule, event.startDate, { from: addDays(from, -durationDays), to });
  const recurring = event.rrule !== null;
  const rangeStart = zonedToUtc(from, "00:00").toISOString();
  const rangeEnd = zonedToUtc(addDays(to, 1), "00:00").toISOString();

  return dates.flatMap((date) => {
    const lastDate = addDays(date, durationDays);
    let start = date;
    let end = lastDate;
    if (!event.allDay && event.startTime && event.endTime) {
      start = zonedToUtc(date, event.startTime).toISOString();
      end = zonedToUtc(lastDate, event.endTime).toISOString();
      if (end <= rangeStart || start >= rangeEnd) return [];
    } else if (lastDate < from || date > to) {
      return [];
    }
    return [
      {
        key: recurring ? `event:${event.id}:${date}` : `event:${event.id}`,
        source: "events",
        kind: event.kind,
        category: event.category,
        title: event.title,
        allDay: event.allDay,
        start,
        end,
        color: event.color,
        participantIds: event.participantIds,
        location: event.location,
        readOnly: false,
        eventId: event.id,
        recurring,
        shop: event.shop,
        href: null,
        meta: null,
      },
    ];
  });
}

/** Sort key: by day in the household zone, all-day entries first, then by start time. */
const sortKey = (entry: CalendarEntry) =>
  entry.allDay ? `${entry.start}|0` : `${zonedParts(entry.start).date}|1|${entry.start}`;

export const sortEntries = (entries: CalendarEntry[]) =>
  entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.title.localeCompare(b.title));
