import { calendarCategorySchema } from "@/features/calendar/types/calendar";
import type { GoogleCalendarInfo, GoogleCalendarSettings, GoogleCalendarUpdate, GooglePublishInput } from "@/features/integrations/types/google";
import { GOOGLE_FEATURE_SCOPES } from "@/features/integrations/types/google";
import { addDays, todayIn } from "@/types/dates";
import { db } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { errorText, withGoogle, type ConnectionForAccess } from "./google-access";
import { mapGoogleEvent, payloadHash, planPublish, publishPayload, type GoogleEventResource, type PublishableEvent } from "./google-calendar-mapping";
import { GoogleApiError, googleJson } from "./google-http";

const API = "https://www.googleapis.com/calendar/v3";
/** A first (full) sync starts this many days back; later syncs are incremental with the sync token. */
const FULL_SYNC_DAYS_BACK = 90;
/** At most this many pages of 250 events per calendar per sync (Google expands recurring events). */
const MAX_PAGES = 40;

type Connection = ConnectionForAccess & { householdId: string; scopes: string[] };

const hasScope = (connection: { scopes: string[] }, feature: "calendar" | "calendar_publish") =>
  GOOGLE_FEATURE_SCOPES[feature].every((scope) => connection.scopes.includes(scope));

const HEX = /^#[0-9a-f]{6}$/i;

type CalendarListEntry = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string; deleted?: boolean };

/** Reads the person's calendar list from Google and stores it; the main calendar is shown by default the first time. */
export async function refreshCalendarList(connection: Connection, signal?: AbortSignal): Promise<void> {
  const entries: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${API}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await withGoogle(connection, (accessToken) =>
      googleJson<{ items?: CalendarListEntry[]; nextPageToken?: string }>(url, { accessToken, signal }),
    );
    entries.push(...(body.items ?? []).filter((entry) => !entry.deleted && entry.accessRole !== "freeBusyReader"));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  const existing = await db.googleCalendar.findMany({ where: { connectionId: connection.id }, select: { id: true, googleCalendarId: true } });
  const seen = new Set<string>();
  for (const entry of entries) {
    seen.add(entry.id);
    const data = {
      name: (entry.summaryOverride ?? entry.summary ?? entry.id).slice(0, 120),
      color: entry.backgroundColor && HEX.test(entry.backgroundColor) ? entry.backgroundColor.toLowerCase() : "#4285f4",
      primary: entry.primary === true,
      accessRole: entry.accessRole ?? "reader",
    };
    await db.googleCalendar.upsert({
      where: { connectionId_googleCalendarId: { connectionId: connection.id, googleCalendarId: entry.id } },
      create: { connectionId: connection.id, googleCalendarId: entry.id, selected: entry.primary === true, ...data },
      update: data,
    });
  }
  const gone = existing.filter((row) => !seen.has(row.googleCalendarId)).map((row) => row.id);
  if (gone.length) await db.googleCalendar.deleteMany({ where: { id: { in: gone } } });
}

type CalendarRow = { id: string; googleCalendarId: string; syncToken: string | null };

/** Applies Google's event changes to the local copy: incremental with the sync token, or a full sync. */
export async function syncCalendarEvents(connection: Connection, calendar: CalendarRow, signal?: AbortSignal): Promise<number> {
  let syncToken = calendar.syncToken;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await syncPages(connection, calendar.id, calendar.googleCalendarId, syncToken, signal);
    } catch (error) {
      // 410 Gone: the sync token expired; start over with a full sync.
      if (!(error instanceof GoogleApiError) || error.status !== 410 || syncToken === null) throw error;
      await db.$transaction([
        db.googleCalendarEvent.deleteMany({ where: { calendarId: calendar.id } }),
        db.googleCalendar.update({ where: { id: calendar.id }, data: { syncToken: null } }),
      ]);
      syncToken = null;
    }
  }
  return 0;
}

const toDay = (date: string) => new Date(`${date}T00:00:00Z`);

async function syncPages(connection: Connection, calendarId: string, googleCalendarId: string, syncToken: string | null, signal?: AbortSignal): Promise<number> {
  let pageToken: string | undefined;
  let changed = 0;
  if (syncToken === null) await db.googleCalendarEvent.deleteMany({ where: { calendarId } });
  for (let page = 0; page < MAX_PAGES; page++) {
    signal?.throwIfAborted();
    const url = new URL(`${API}/calendars/${encodeURIComponent(googleCalendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");
    if (syncToken) url.searchParams.set("syncToken", syncToken);
    else url.searchParams.set("timeMin", `${addDays(todayIn(), -FULL_SYNC_DAYS_BACK)}T00:00:00Z`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await withGoogle(connection, (accessToken) =>
      googleJson<{ items?: GoogleEventResource[]; nextPageToken?: string; nextSyncToken?: string }>(url, { accessToken, signal }),
    );
    for (const item of body.items ?? []) {
      if (!item.id) continue;
      const mapped = mapGoogleEvent(item);
      changed++;
      if (!mapped) {
        await db.googleCalendarEvent.deleteMany({ where: { calendarId, googleEventId: item.id } });
        continue;
      }
      const data = {
        title: mapped.title,
        location: mapped.location,
        allDay: mapped.allDay,
        start: mapped.start,
        end: mapped.end,
        startDay: toDay(mapped.startDay),
        endDay: toDay(mapped.endDay),
        htmlLink: mapped.htmlLink,
      };
      await db.googleCalendarEvent.upsert({
        where: { calendarId_googleEventId: { calendarId, googleEventId: item.id } },
        create: { calendarId, googleEventId: item.id, ...data },
        update: data,
      });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) {
      await db.googleCalendar.update({
        where: { id: calendarId },
        data: { syncToken: body.nextSyncToken ?? null, lastSyncedAt: new Date(), lastError: null },
      });
      return changed;
    }
  }
  // Too many pages: keep what we have, try a full sync next time.
  await db.googleCalendar.update({ where: { id: calendarId }, data: { syncToken: null, lastSyncedAt: new Date() } });
  return changed;
}

// ── Publishing ───────────────────────────────────────────────────────────────────────────────────────

type PublishConnection = Connection & { publishCalendarId: string | null; publishCategories: string[] };

export type PublishResult = { created: number; updated: number; removed: number };

/** One publish at a time per connection (job, *Sync now*, instant push), so an event is never created twice. */
const publishLocks = new Map<string, Promise<unknown>>();

function withPublishLock<T>(connectionId: string, work: () => Promise<T>): Promise<T> {
  const previous = publishLocks.get(connectionId) ?? Promise.resolve();
  const current = previous.then(work, work);
  const settled = current.catch(() => undefined);
  publishLocks.set(connectionId, settled);
  void settled.then(() => {
    if (publishLocks.get(connectionId) === settled) publishLocks.delete(connectionId);
  });
  return current;
}

/**
 * Pushes household events of the chosen categories to the target calendar (one-way) and removes what no longer
 * belongs. With `eventIds` only those events are looked at (created, updated, or removed when deleted or no
 * longer in a published category); other published events are left alone.
 */
export function publishHouseholdEvents(
  connection: PublishConnection,
  { signal, eventIds }: { signal?: AbortSignal; eventIds?: readonly string[] } = {},
): Promise<PublishResult> {
  if (eventIds && eventIds.length === 0) return Promise.resolve({ created: 0, updated: 0, removed: 0 });
  return withPublishLock(connection.id, () => publish(connection, signal, eventIds && [...new Set(eventIds)]));
}

async function publish(connection: PublishConnection, signal: AbortSignal | undefined, eventIds: string[] | undefined): Promise<PublishResult> {
  const target = connection.publishCalendarId
    ? await db.googleCalendar.findFirst({ where: { id: connection.publishCalendarId, connectionId: connection.id } })
    : null;
  const categories = connection.publishCategories.flatMap((value) => {
    const parsed = calendarCategorySchema.safeParse(value);
    return parsed.success ? [parsed.data.toUpperCase() as Uppercase<typeof parsed.data>] : [];
  });
  const rows =
    target && categories.length
      ? await db.calendarEvent.findMany({
          where: { householdId: connection.householdId, category: { in: categories }, ...(eventIds && { id: { in: eventIds } }) },
          select: { id: true, title: true, description: true, location: true, allDay: true, startDate: true, endDate: true, startsAt: true, endsAt: true, rrule: true },
        })
      : [];
  const wanted: PublishableEvent[] = rows.map((row) => ({
    ...row,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
  }));
  const published = await db.googlePublishedEvent.findMany({
    where: { connectionId: connection.id, ...(eventIds && { calendarEventId: { in: eventIds } }) },
  });
  const plan = planPublish(wanted, published, target?.googleCalendarId ?? null, eventIds);
  if (!hasScope(connection, "calendar_publish") && (plan.create.length || plan.update.length || plan.remove.length)) {
    throw new Error("Writing to Google Calendar isn't allowed (yet)");
  }

  const eventsUrl = (googleCalendarId: string, eventId?: string) =>
    `${API}/calendars/${encodeURIComponent(googleCalendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;

  for (const row of plan.remove) {
    signal?.throwIfAborted();
    try {
      await withGoogle(connection, (accessToken) => googleJson(eventsUrl(row.googleCalendarId, row.googleEventId), { method: "DELETE", accessToken, signal }));
    } catch (error) {
      // Already gone in Google (deleted by hand, or calendar removed): forget it anyway.
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 410)) throw error;
    }
    await db.googlePublishedEvent.deleteMany({ where: { connectionId: connection.id, calendarEventId: row.calendarEventId } });
  }
  if (target) {
    for (const event of plan.create) {
      signal?.throwIfAborted();
      const payload = publishPayload(event);
      const created = await withGoogle(connection, (accessToken) =>
        googleJson<{ id: string }>(eventsUrl(target.googleCalendarId), {
          method: "POST",
          accessToken,
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      await db.googlePublishedEvent.create({
        data: { connectionId: connection.id, calendarEventId: event.id, googleCalendarId: target.googleCalendarId, googleEventId: created.id, contentHash: payloadHash(payload) },
      });
    }
    for (const { event, googleEventId } of plan.update) {
      signal?.throwIfAborted();
      const payload = publishPayload(event);
      await withGoogle(connection, (accessToken) =>
        googleJson(eventsUrl(target.googleCalendarId, googleEventId), {
          method: "PUT",
          accessToken,
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      await db.googlePublishedEvent.update({
        where: { connectionId_calendarEventId: { connectionId: connection.id, calendarEventId: event.id } },
        data: { contentHash: payloadHash(payload) },
      });
    }
  }
  return { created: plan.create.length, updated: plan.update.length, removed: plan.remove.length };
}

// ── Sync of one connection, and of everyone (the job) ────────────────────────────────────────────────

const connectionSelect = {
  id: true,
  userId: true,
  householdId: true,
  refreshTokenEnc: true,
  status: true,
  scopes: true,
  publishCalendarId: true,
  publishCategories: true,
} as const;

/** Refreshes the calendar list, syncs the selected calendars and publishes. Errors are stored per calendar. */
export async function syncConnectionCalendars(connectionId: string, { signal, log }: { signal?: AbortSignal; log?: (line: string) => void } = {}): Promise<{ failed: number }> {
  const connection = await db.googleConnection.findUnique({ where: { id: connectionId }, select: connectionSelect });
  if (!connection || connection.status !== "CONNECTED" || !hasScope(connection, "calendar")) return { failed: 0 };
  let failed = 0;
  try {
    await refreshCalendarList(connection, signal);
  } catch (error) {
    log?.(`calendar list: ${errorText(error)}`);
    failed++;
  }
  const calendars = await db.googleCalendar.findMany({
    where: { connectionId, selected: true },
    select: { id: true, name: true, googleCalendarId: true, syncToken: true },
  });
  for (const calendar of calendars) {
    try {
      const changes = await syncCalendarEvents(connection, calendar, signal);
      log?.(`${calendar.name}: ${changes} change(s)`);
    } catch (error) {
      failed++;
      await db.googleCalendar.update({ where: { id: calendar.id }, data: { lastError: errorText(error) } });
      log?.(`${calendar.name}: ${errorText(error)}`);
    }
  }
  const publishing = connection.publishCalendarId || (await db.googlePublishedEvent.count({ where: { connectionId } })) > 0;
  if (publishing) {
    try {
      const result = await publishHouseholdEvents(connection, { signal });
      await db.googleConnection.update({ where: { id: connectionId }, data: { lastPublishedAt: new Date(), publishError: null } });
      log?.(`published: +${result.created} ~${result.updated} -${result.removed}`);
    } catch (error) {
      failed++;
      await db.googleConnection.update({ where: { id: connectionId }, data: { publishError: errorText(error) } });
      log?.(`publishing: ${errorText(error)}`);
    }
  }
  return { failed };
}

/**
 * The instant push after household events changed (google-calendar-push.ts): for every connection of the
 * household that publishes, or published one of these events before, just these events are created, updated or
 * removed in Google. A failure is stored as the connection's `publishError`; the 15-minute job retries
 * everything (and clears the error once a full publish succeeds).
 */
export async function publishChangedEvents(householdId: string, eventIds: readonly string[]): Promise<{ connections: number; failed: number }> {
  if (eventIds.length === 0) return { connections: 0, failed: 0 };
  const connections = await db.googleConnection.findMany({
    where: {
      householdId,
      status: "CONNECTED",
      OR: [{ publishCalendarId: { not: null } }, { publishedEvents: { some: { calendarEventId: { in: [...eventIds] } } } }],
    },
    select: connectionSelect,
  });
  let failed = 0;
  let used = 0;
  for (const connection of connections.filter((item) => hasScope(item, "calendar"))) {
    used++;
    try {
      const result = await publishHouseholdEvents(connection, { eventIds });
      if (result.created || result.updated || result.removed) {
        await db.googleConnection.update({ where: { id: connection.id }, data: { lastPublishedAt: new Date() } });
      }
    } catch (error) {
      failed++;
      await db.googleConnection.update({ where: { id: connection.id }, data: { publishError: errorText(error) } });
      console.error(`[integrations] instant publish to Google Calendar failed (connection ${connection.id}): ${errorText(error)}`);
    }
  }
  return { connections: used, failed };
}

export async function syncAllCalendars({ signal, log }: { signal: AbortSignal; log: (line: string) => void }) {
  const connections = await db.googleConnection.findMany({
    where: { status: "CONNECTED" },
    select: { id: true, googleAccountEmail: true, scopes: true },
  });
  let failed = 0;
  let synced = 0;
  for (const connection of connections.filter((item) => hasScope(item, "calendar"))) {
    signal.throwIfAborted();
    const result = await syncConnectionCalendars(connection.id, { signal, log });
    failed += result.failed;
    synced++;
  }
  return { synced, failed };
}

// ── Settings (the card) ──────────────────────────────────────────────────────────────────────────────

type CalendarInfoRow = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  accessRole: string;
  selected: boolean;
  visibility: "HOUSEHOLD" | "PRIVATE";
  lastSyncedAt: Date | null;
  lastError: string | null;
  _count: { events: number };
};

const calendarInfoSelect = {
  id: true,
  name: true,
  color: true,
  primary: true,
  accessRole: true,
  selected: true,
  visibility: true,
  lastSyncedAt: true,
  lastError: true,
  _count: { select: { events: true } },
} as const;

function toCalendarInfo(row: CalendarInfoRow): GoogleCalendarInfo {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    primary: row.primary,
    canWrite: row.accessRole === "owner" || row.accessRole === "writer",
    selected: row.selected,
    visibility: row.visibility === "PRIVATE" ? "private" : "household",
    eventCount: row._count.events,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

export async function listCalendarInfos(connectionId: string): Promise<GoogleCalendarInfo[]> {
  const rows = await db.googleCalendar.findMany({
    where: { connectionId },
    select: calendarInfoSelect,
    orderBy: [{ primary: "desc" }, { name: "asc" }],
  });
  return rows.map(toCalendarInfo);
}

export async function calendarSettings(connection: {
  id: string;
  publishCalendarId: string | null;
  publishCategories: string[];
  lastPublishedAt: Date | null;
  publishError: string | null;
}): Promise<GoogleCalendarSettings> {
  const [calendars, publishedCount] = await Promise.all([
    listCalendarInfos(connection.id),
    db.googlePublishedEvent.count({ where: { connectionId: connection.id } }),
  ]);
  return {
    calendars,
    publish: {
      calendarId: connection.publishCalendarId,
      categories: connection.publishCategories,
      publishedCount,
      lastPublishedAt: connection.lastPublishedAt?.toISOString() ?? null,
      lastError: connection.publishError,
    },
  };
}

/** Show/hide a calendar or change who sees it. Hiding forgets its events; showing syncs it right away. */
export async function updateCalendar(connection: Connection, id: string, update: GoogleCalendarUpdate): Promise<GoogleCalendarInfo> {
  const calendar = await db.googleCalendar.findFirst({ where: { id, connectionId: connection.id } });
  if (!calendar) throw notFound("Calendar not found");
  await db.googleCalendar.update({
    where: { id },
    data: {
      ...(update.selected !== undefined && { selected: update.selected }),
      ...(update.visibility && { visibility: update.visibility === "private" ? "PRIVATE" : "HOUSEHOLD" }),
      ...(update.selected === false && { syncToken: null, lastError: null }),
    },
  });
  if (update.selected === false) await db.googleCalendarEvent.deleteMany({ where: { calendarId: id } });
  if (update.selected === true && !calendar.selected) {
    try {
      await syncCalendarEvents(connection, { id, googleCalendarId: calendar.googleCalendarId, syncToken: null });
    } catch (error) {
      await db.googleCalendar.update({ where: { id }, data: { lastError: errorText(error) } });
    }
  }
  const row = await db.googleCalendar.findUniqueOrThrow({ where: { id }, select: calendarInfoSelect });
  return toCalendarInfo(row);
}

/** Sets the publish target (null = off) and categories. Turning it off removes published events at the next sync. */
export async function setPublishSettings(connection: Connection, input: GooglePublishInput): Promise<void> {
  const categories = [...new Set(input.categories)];
  if (categories.some((value) => !calendarCategorySchema.safeParse(value).success)) throw badRequest("Unknown category", { categories: ["Unknown category"] });
  if (input.calendarId) {
    if (!hasScope(connection, "calendar_publish")) throw badRequest("Allow writing to Google Calendar first");
    const target = await db.googleCalendar.findFirst({ where: { id: input.calendarId, connectionId: connection.id } });
    if (!target) throw notFound("Calendar not found");
    if (target.accessRole !== "owner" && target.accessRole !== "writer") throw badRequest("You can't add events to this calendar");
  }
  await db.googleConnection.update({
    where: { id: connection.id },
    data: { publishCalendarId: input.calendarId, publishCategories: input.calendarId ? categories : [], publishError: null },
  });
}
