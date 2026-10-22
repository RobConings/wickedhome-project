import type { CalendarOverlayItem } from "@/features/calendar/types/calendar";
import type { CalendarSource } from "../calendar/calendar-sources";
import { db } from "../lib/db";

/**
 * Calendar source `google`: events of the Google calendars people chose to show, from the local copy (fast,
 * and still there when Google isn't reachable). Calendars marked "only me" appear only for their owner.
 * Read-only; opening one goes to the event in Google Calendar.
 */
export const googleCalendarSource: CalendarSource = {
  id: "google",
  kind: "event",
  labelKey: "integrations:google.calendar.sourceLabel",
  async load({ householdId, userId, from, to }): Promise<CalendarOverlayItem[]> {
    const rows = await db.googleCalendarEvent.findMany({
      where: {
        startDay: { lte: new Date(`${to}T00:00:00Z`) },
        endDay: { gte: new Date(`${from}T00:00:00Z`) },
        calendar: {
          selected: true,
          connection: { householdId, status: "CONNECTED" },
          OR: [{ visibility: "HOUSEHOLD" }, ...(userId ? [{ connection: { userId } }] : [])],
        },
      },
      select: {
        id: true,
        title: true,
        location: true,
        allDay: true,
        start: true,
        end: true,
        htmlLink: true,
        calendar: { select: { name: true, color: true, connection: { select: { user: { select: { habitantId: true } } } } } },
      },
      take: 2000,
    });
    return rows.map((row) => {
      const habitantId = row.calendar.connection.user.habitantId;
      return {
        id: row.id,
        kind: "event",
        title: row.title,
        allDay: row.allDay,
        start: row.start,
        end: row.end,
        color: row.calendar.color,
        participantIds: habitantId ? [habitantId] : [],
        location: row.location,
        href: row.htmlLink,
        meta: { calendar: row.calendar.name },
      };
    });
  },
};
