/*
 * In-process notifications when household calendar events change, so other API features (e.g. publishing to
 * Google Calendar, src/api/integrations/google-calendar-push.ts) can react right away without the calendar
 * feature depending on them.
 *
 *   import { onCalendarEventChanged } from "../calendar/calendar-events";
 *   const stop = onCalendarEventChanged(({ householdId, eventId, change }) => { … });
 *
 * Fired after the change is committed, from every create/update/delete in calendar.service.ts (the routes and
 * the assistant go through it). A recurring event is one row (the series), so editing or deleting a series is
 * one "updated"/"deleted" for that id. A listener that throws is logged; it never breaks the calendar request.
 * Listeners are awaited: keep them quick (schedule work, don't do it inline).
 */
export type CalendarEventChange = "created" | "updated" | "deleted";

export type CalendarEventChangedEvent = { householdId: string; eventId: string; change: CalendarEventChange };

type Listener = (event: CalendarEventChangedEvent) => Promise<void> | void;

const listeners = new Set<Listener>();

/** Subscribes to household event changes; returns the unsubscribe function. */
export function onCalendarEventChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifies every listener, in order. Never throws. */
export async function emitCalendarEventChanged(householdId: string, eventId: string, change: CalendarEventChange) {
  for (const listener of [...listeners]) {
    try {
      await listener({ householdId, eventId, change });
    } catch (error) {
      console.error(`[calendar] event-changed listener failed (${change} ${eventId})`, error);
    }
  }
}
