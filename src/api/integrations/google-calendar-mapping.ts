import { createHash } from "node:crypto";
import { addDays, HOUSEHOLD_TIME_ZONE } from "@/types/dates";

/*
 * Pure mapping between Google Calendar resources and WickedHome (unit-tested in google.test.ts).
 */

export type GoogleEventTime = { date?: string; dateTime?: string; timeZone?: string };

/** The fields of a Google `Event` resource we read. */
export type GoogleEventResource = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  htmlLink?: string;
};

/** What we keep of a Google event (`GoogleCalendarEvent` row without its ids). */
export type MappedEvent = {
  googleEventId: string;
  title: string;
  location: string | null;
  allDay: boolean;
  /** All-day `YYYY-MM-DD` (end inclusive); timed ISO instants. */
  start: string;
  end: string;
  /** Days touched in the household time zone (inclusive), `YYYY-MM-DD`. */
  startDay: string;
  endDay: string;
  htmlLink: string | null;
};

/** The calendar date of an instant in a time zone. */
export function dateInZone(instant: Date, timeZone: string = HOUSEHOLD_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Maps a Google event to what the calendar shows; `null` for cancelled or unreadable events.
 * - All-day: Google's end date is exclusive, ours is inclusive.
 * - Timed: instants (Google sends a local time with offset; the offset decides the instant, the event's
 *   own time zone doesn't matter for display). The days it touches are computed in Europe/Brussels, and an
 *   event ending exactly at midnight doesn't touch the next day.
 */
export function mapGoogleEvent(event: GoogleEventResource): MappedEvent | null {
  if (event.status === "cancelled" || !event.start || !event.end) return null;
  const title = event.summary?.trim().slice(0, 200) || "—";
  const location = event.location?.trim().slice(0, 200) || null;
  const htmlLink = event.htmlLink?.startsWith("https://") ? event.htmlLink : null;

  if (event.start.date && ISO_DATE.test(event.start.date)) {
    const start = event.start.date;
    const exclusiveEnd = event.end.date && ISO_DATE.test(event.end.date) ? event.end.date : addDays(start, 1);
    const lastDay = addDays(exclusiveEnd, -1);
    const end = lastDay < start ? start : lastDay;
    return { googleEventId: event.id, title, location, allDay: true, start, end, startDay: start, endDay: end, htmlLink };
  }

  if (!event.start.dateTime || !event.end.dateTime) return null;
  const startsAt = new Date(event.start.dateTime);
  const endsAtRaw = new Date(event.end.dateTime);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAtRaw.getTime())) return null;
  const endsAt = endsAtRaw < startsAt ? startsAt : endsAtRaw;
  const startDay = dateInZone(startsAt);
  const lastInstant = endsAt > startsAt ? new Date(endsAt.getTime() - 1) : endsAt;
  const endDay = dateInZone(lastInstant) < startDay ? startDay : dateInZone(lastInstant);
  return {
    googleEventId: event.id,
    title,
    location,
    allDay: false,
    start: startsAt.toISOString(),
    end: endsAt.toISOString(),
    startDay,
    endDay,
    htmlLink,
  };
}

/** Whether a stored event touches the inclusive range [from, to]. */
export const touchesRange = (event: Pick<MappedEvent, "startDay" | "endDay">, from: string, to: string) =>
  event.startDay <= to && event.endDay >= from;

// ── Publishing household events ──────────────────────────────────────────────────────────────────────

/** A household calendar event as publishing needs it. */
export type PublishableEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  /** `YYYY-MM-DD`, inclusive, household time zone. */
  startDate: string;
  endDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  rrule: string | null;
};

/** The Google `Event` body for an event: summary, description, location, start/end, recurrence. */
export function eventPayload(event: Omit<PublishableEvent, "id">): Record<string, unknown> {
  const timed = !event.allDay && event.startsAt && event.endsAt;
  return {
    summary: event.title,
    ...(event.description && { description: event.description }),
    ...(event.location && { location: event.location }),
    start: timed
      ? { dateTime: (event.startsAt as Date).toISOString(), timeZone: HOUSEHOLD_TIME_ZONE }
      : { date: event.startDate },
    end: timed
      ? { dateTime: (event.endsAt as Date).toISOString(), timeZone: HOUSEHOLD_TIME_ZONE }
      : { date: addDays(event.endDate, 1) },
    ...(event.rrule && { recurrence: [`RRULE:${event.rrule.replace(/^RRULE:/i, "")}`] }),
  };
}

/** The Google `Event` body for a household event. Marked as ours with a private extended property. */
export function publishPayload(event: PublishableEvent): Record<string, unknown> {
  return { ...eventPayload(event), extendedProperties: { private: { wickedhomeEventId: event.id } } };
}

/** Stable hash of what we send, so unchanged events aren't sent again. */
export const payloadHash = (payload: Record<string, unknown>) => createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export type PublishPlan = {
  create: PublishableEvent[];
  update: { event: PublishableEvent; googleEventId: string }[];
  remove: { calendarEventId: string; googleEventId: string; googleCalendarId: string }[];
};

/**
 * What to send to the target calendar: new events are created, changed ones (other hash, or another target
 * calendar) updated (or moved: removed + created), and published events no longer wanted are removed.
 *
 * With `onlyEventIds` (an instant push after an edit) just those events are considered: other published events
 * are left alone, even though they aren't in `wanted`.
 */
export function planPublish(
  wantedEvents: PublishableEvent[],
  publishedRows: { calendarEventId: string; googleEventId: string; googleCalendarId: string; contentHash: string }[],
  targetGoogleCalendarId: string | null,
  onlyEventIds?: readonly string[],
): PublishPlan {
  const only = onlyEventIds && new Set(onlyEventIds);
  const wanted = only ? wantedEvents.filter((event) => only.has(event.id)) : wantedEvents;
  const published = only ? publishedRows.filter((row) => only.has(row.calendarEventId)) : publishedRows;
  const plan: PublishPlan = { create: [], update: [], remove: [] };
  const byEvent = new Map(published.map((row) => [row.calendarEventId, row]));
  const keep = new Set<string>();
  if (targetGoogleCalendarId) {
    for (const event of wanted) {
      const row = byEvent.get(event.id);
      if (!row) {
        plan.create.push(event);
        continue;
      }
      if (row.googleCalendarId !== targetGoogleCalendarId) continue; // removed below, created again
      keep.add(event.id);
      if (row.contentHash !== payloadHash(publishPayload(event))) plan.update.push({ event, googleEventId: row.googleEventId });
    }
    for (const event of wanted) {
      const row = byEvent.get(event.id);
      if (row && row.googleCalendarId !== targetGoogleCalendarId) plan.create.push(event);
    }
  }
  for (const row of published) {
    if (!keep.has(row.calendarEventId)) {
      plan.remove.push({ calendarEventId: row.calendarEventId, googleEventId: row.googleEventId, googleCalendarId: row.googleCalendarId });
    }
  }
  return plan;
}
