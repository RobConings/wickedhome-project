import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";
import { zonedToUtc } from "@/features/calendar/types/calendar-time";
import { GOOGLE_FEATURE_SCOPES } from "@/features/integrations/types/google";
import type { CalendarWriter } from "../calendar/calendar-sources";
import { db } from "../lib/db";
import { HttpError, badRequest } from "../lib/http";
import { errorText, withGoogle } from "./google-access";
import { syncCalendarEvents } from "./google-calendar.service";
import { eventPayload } from "./google-calendar-mapping";
import { GoogleApiError, googleJson } from "./google-http";

const API = "https://www.googleapis.com/calendar/v3";

/**
 * Calendar writer `google`: a new event can go straight into one of the person's own Google calendars,
 * instead of the household calendar. Offered: calendars shown in WickedHome (selected) that the person may
 * change (owner/writer, which includes a work calendar shared with "make changes"), on a connection that
 * granted writing (`calendar_publish`). After creating, that calendar is synced at once, so the event shows
 * on the WickedHome calendar right away (once, through the `google` calendar source).
 */

const writable = (userId: string, householdId: string) => ({
  selected: true,
  accessRole: { in: ["owner", "writer"] },
  connection: { userId, householdId, status: "CONNECTED" as const, scopes: { hasEvery: [...GOOGLE_FEATURE_SCOPES.calendar_publish] } },
});

export const googleCalendarWriter: CalendarWriter = {
  id: "google",
  async targets({ householdId, userId }) {
    const rows = await db.googleCalendar.findMany({
      where: writable(userId, householdId),
      select: { id: true, name: true, color: true, connection: { select: { googleAccountEmail: true } } },
      orderBy: [{ primary: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => ({ id: row.id, label: row.name, color: row.color, account: row.connection.googleAccountEmail }));
  },
  async create({ householdId, userId }, targetId, input) {
    const calendar = await db.googleCalendar.findFirst({
      where: { id: targetId, ...writable(userId, householdId) },
      select: {
        id: true,
        googleCalendarId: true,
        syncToken: true,
        connection: { select: { id: true, userId: true, householdId: true, refreshTokenEnc: true, status: true, scopes: true } },
      },
    });
    if (!calendar) throw badRequest("Validation failed", { target: ["unknownTarget"] });
    const timed = !input.allDay && input.startTime && input.endTime;
    const payload = eventPayload({
      title: input.title,
      description: input.description || null,
      location: input.location || null,
      allDay: !timed,
      startDate: input.startDate,
      endDate: input.endDate,
      startsAt: timed ? zonedToUtc(input.startDate, input.startTime as string, HOUSEHOLD_TIME_ZONE) : null,
      endsAt: timed ? zonedToUtc(input.endDate, input.endTime as string, HOUSEHOLD_TIME_ZONE) : null,
      rrule: input.rrule || null,
    });
    const { connection } = calendar;
    try {
      await withGoogle(connection, (accessToken) =>
        googleJson<{ id: string }>(`${API}/calendars/${encodeURIComponent(calendar.googleCalendarId)}/events`, {
          method: "POST",
          accessToken,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    } catch (error) {
      if (error instanceof GoogleApiError && (error.status === 403 || error.status === 404)) {
        throw new HttpError(502, "google_refused", "Google didn't allow adding events to this calendar");
      }
      throw new HttpError(502, "google_failed", `Google Calendar: ${errorText(error)}`);
    }
    // Show it right away; if this sync fails, the 15-minute job brings it in.
    try {
      await syncCalendarEvents(connection, calendar);
    } catch (error) {
      await db.googleCalendar.update({ where: { id: calendar.id }, data: { lastError: errorText(error) } });
    }
  },
};
