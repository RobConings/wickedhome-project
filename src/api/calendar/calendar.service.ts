import { eventEntries, sortEntries } from "@/features/calendar/types/calendar-occurrences";
import { zonedParts, zonedToUtc } from "@/features/calendar/types/calendar-time";
import {
  eventColor,
  isExternalTarget,
  type AgendaQuery,
  type CalendarAgenda,
  type CalendarCategory,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventKind,
  type StoreVisit,
  type StoreVisitQuery,
} from "@/features/calendar/types/calendar";
import { addDays, todayIn } from "@/types/dates";
import {
  db,
  type CalendarCategory as CalendarCategoryRow,
  type CalendarEventKind as CalendarEventKindRow,
  type Prisma,
} from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { shopRefSelect, toShopRef } from "../shops/shops.service";
import { emitCalendarEventChanged } from "./calendar-events";
import { calendarSourceInfos, calendarTargets, loadOverlayEntries, writerFor } from "./calendar-sources";

const toKind = (kind: CalendarEventKindRow) => kind.toLowerCase() as CalendarEventKind;
const fromKind = (kind: CalendarEventKind) => kind.toUpperCase() as CalendarEventKindRow;
const toCategory = (category: CalendarCategoryRow) => category.toLowerCase() as CalendarCategory;
const fromCategory = (category: CalendarCategory) => category.toUpperCase() as CalendarCategoryRow;

const toDateColumn = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDateColumn = (date: Date) => date.toISOString().slice(0, 10);

const include = {
  participants: { orderBy: { position: "asc" }, select: { habitantId: true, habitant: { select: { color: true } } } },
  shop: { select: shopRefSelect },
} as const satisfies Prisma.CalendarEventInclude;

type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof include }>;

function toEvent(row: EventRow): CalendarEvent {
  const timed = !row.allDay && row.startsAt && row.endsAt;
  const kind = toKind(row.kind);
  const category = row.category ? toCategory(row.category) : null;
  return {
    id: row.id,
    kind,
    title: row.title,
    description: row.description,
    location: row.location,
    category,
    allDay: !timed,
    startDate: fromDateColumn(row.startDate),
    endDate: fromDateColumn(row.endDate),
    startTime: timed ? zonedParts(row.startsAt as Date).time : null,
    endTime: timed ? zonedParts(row.endsAt as Date).time : null,
    rrule: row.rrule,
    participantIds: row.participants.map((participant) => participant.habitantId),
    shop: row.shop && toShopRef(row.shop),
    color: eventColor({
      kind,
      category,
      participantColors: row.participants.map((participant) => participant.habitant.color),
    }),
  };
}

/** Household events that may have an occurrence in the range: overlapping one-offs and every series started by `to`. */
async function findEventsInRange(householdId: string, { from, to }: AgendaQuery) {
  const rows = await db.calendarEvent.findMany({
    where: {
      householdId,
      startDate: { lte: toDateColumn(to) },
      OR: [{ rrule: { not: null } }, { endDate: { gte: toDateColumn(from) } }],
    },
    include,
    orderBy: [{ startDate: "asc" }, { startsAt: "asc" }],
  });
  return rows.map(toEvent);
}

export async function getAgenda(householdId: string, range: AgendaQuery, userId?: string): Promise<CalendarAgenda> {
  const [events, overlays, targets] = await Promise.all([
    findEventsInRange(householdId, range),
    loadOverlayEntries({ householdId, userId, ...range }),
    userId ? calendarTargets({ householdId, userId }) : Promise.resolve([]),
  ]);
  const entries = events.flatMap((event) => eventEntries(event, range));
  const used = new Set(entries.map((entry) => entry.eventId));
  return {
    ...range,
    entries: sortEntries([...entries, ...overlays]),
    events: events.filter((event) => used.has(event.id)),
    sources: calendarSourceInfos(),
    targets,
  };
}

/** Upcoming store visits, one per occurrence: the contract Shopping uses to link a shop to the calendar. */
export async function listStoreVisits(householdId: string, query: StoreVisitQuery): Promise<StoreVisit[]> {
  const from = query.from ?? todayIn();
  const to = query.to && query.to >= from ? query.to : addDays(from, 60);
  const rows = await db.calendarEvent.findMany({
    where: {
      householdId,
      kind: "STORE_VISIT",
      shopId: query.shopId ?? { not: null },
      startDate: { lte: toDateColumn(to) },
      OR: [{ rrule: { not: null } }, { endDate: { gte: toDateColumn(from) } }],
    },
    include,
  });
  const entries = sortEntries(rows.map(toEvent).flatMap((event) => eventEntries(event, { from, to })));
  return entries.flatMap((entry) =>
    entry.eventId && entry.shop
      ? [
          {
            eventId: entry.eventId,
            key: entry.key,
            title: entry.title,
            shop: entry.shop,
            allDay: entry.allDay,
            start: entry.start,
            end: entry.end,
            recurring: entry.recurring,
          },
        ]
      : [],
  );
}

/** Loads an event, scoped to the household so ids from other households 404. */
async function findOwnEvent(householdId: string, id: string) {
  const row = await db.calendarEvent.findFirst({ where: { id, householdId }, include });
  if (!row) throw notFound("Event not found");
  return row;
}

export async function getEvent(householdId: string, id: string): Promise<CalendarEvent> {
  return toEvent(await findOwnEvent(householdId, id));
}

/** Participants must be the household's habitants and the shop one it can see; otherwise a 400 on that field. */
async function checkReferences(householdId: string, input: CalendarEventInput) {
  const participantIds = [...new Set(input.participantIds)];
  if (participantIds.length > 0) {
    const found = await db.habitant.count({ where: { householdId, id: { in: participantIds } } });
    if (found !== participantIds.length) {
      throw badRequest("Validation failed", { participantIds: ["unknownParticipant"] });
    }
  }
  if (input.kind === "store_visit" && input.shopId) {
    const shop = await db.shop.findFirst({
      where: { id: input.shopId, OR: [{ householdId }, { householdId: null }] },
      select: { id: true },
    });
    if (!shop) throw badRequest("Validation failed", { shopId: ["unknownShop"] });
  }
  return participantIds;
}

function toData(input: CalendarEventInput) {
  const timed = !input.allDay && input.startTime && input.endTime;
  return {
    kind: fromKind(input.kind),
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    category: input.category ? fromCategory(input.category) : null,
    allDay: !timed,
    startDate: toDateColumn(input.startDate),
    endDate: toDateColumn(input.endDate),
    startsAt: timed ? zonedToUtc(input.startDate, input.startTime as string) : null,
    endsAt: timed ? zonedToUtc(input.endDate, input.endTime as string) : null,
    rrule: input.rrule || null,
    shopId: input.kind === "store_visit" ? (input.shopId ?? null) : null,
  };
}

const participantRows = (ids: string[]) => ids.map((habitantId, position) => ({ habitantId, position }));

/**
 * Creates the event where `input.target` says: a household event (`createEvent`), or, with another target (a
 * person's Google calendar), an event in that calendar through its writer. There it is a plain event (no kind,
 * category, participants or shop) and `null` is returned: it isn't a household event (it shows through its
 * calendar source).
 */
export async function createEventIn(householdId: string, userId: string, input: CalendarEventInput): Promise<CalendarEvent | null> {
  if (!isExternalTarget(input.target)) return createEvent(householdId, input);
  const found = writerFor(input.target);
  if (!found) throw badRequest("Validation failed", { target: ["unknownTarget"] });
  await found.writer.create({ householdId, userId }, found.id, { ...input, kind: "event", category: null, participantIds: [], shopId: null });
  return null;
}

/** A household event (`input.target` is ignored; see `createEventIn`). */
export async function createEvent(householdId: string, input: CalendarEventInput): Promise<CalendarEvent> {
  const participantIds = await checkReferences(householdId, input);
  const row = await db.calendarEvent.create({
    data: { householdId, ...toData(input), participants: { create: participantRows(participantIds) } },
    include,
  });
  await emitCalendarEventChanged(householdId, row.id, "created");
  return toEvent(row);
}

/** Updates the event; for a recurring event that is the whole series. */
export async function updateEvent(householdId: string, id: string, input: CalendarEventInput): Promise<CalendarEvent> {
  await findOwnEvent(householdId, id);
  const participantIds = await checkReferences(householdId, input);
  const row = await db.calendarEvent.update({
    where: { id },
    data: { ...toData(input), participants: { deleteMany: {}, create: participantRows(participantIds) } },
    include,
  });
  await emitCalendarEventChanged(householdId, id, "updated");
  return toEvent(row);
}

/** Deletes the event; for a recurring event that is the whole series. */
export async function deleteEvent(householdId: string, id: string): Promise<void> {
  await findOwnEvent(householdId, id);
  await db.calendarEvent.delete({ where: { id } });
  await emitCalendarEventChanged(householdId, id, "deleted");
}
