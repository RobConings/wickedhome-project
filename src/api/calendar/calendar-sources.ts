import {
  CALENDAR_KIND_COLORS,
  type CalendarEntry,
  type CalendarEntryKind,
  type CalendarEventInput,
  type CalendarOverlayItem,
  type CalendarSourceInfo,
  type CalendarTarget,
} from "@/features/calendar/types/calendar";
import { birthdaysSource } from "./birthdays.source";

/**
 * Calendar sources: read-only overlays that other features put on the household calendar, without the
 * calendar knowing about those features.
 *
 * A feature that wants its dates on the calendar (tasks with a due date, bills, subscription renewals…)
 * registers a source from its own API folder, typically at the top level of its routes file, which
 * `src/api/app.ts` imports at startup:
 *
 *   // src/api/tasks/tasks.routes.ts
 *   import { registerCalendarSource } from "../calendar/calendar-sources";
 *
 *   registerCalendarSource({
 *     id: "tasks",
 *     async load({ householdId, from, to }) {
 *       const tasks = await db.task.findMany({ where: { householdId, dueDate: { gte: d(from), lte: d(to) } } });
 *       return tasks.map((task) => ({
 *         id: task.id, kind: "task", title: task.title, allDay: true,
 *         start: iso(task.dueDate), participantIds: task.assigneeIds, href: `/tasks/${task.id}`,
 *       }));
 *     },
 *   });
 *
 * `kind` (its icon) and `labelKey` (an i18n key, e.g. "waste:calendarSource") give the source its chip in the
 * calendar legend, where people show or hide it (`?sources=`). Without them the chip uses the kind of the
 * source's entries and `calendar:sources.<id>`.
 *
 * `load` gets the household and the inclusive date range, and returns `CalendarOverlayItem`s
 * (`@/features/calendar/types/calendar`). The calendar scopes nothing for you: filter on `householdId`.
 * A source that throws is logged and skipped; the rest of the calendar still loads.
 */
export type CalendarSourceContext = {
  householdId: string;
  /** The signed-in person viewing the calendar, for sources with personal items (e.g. private Google calendars). */
  userId?: string;
  /** Inclusive `YYYY-MM-DD` range in the household time zone. */
  from: string;
  to: string;
};

export type CalendarSource = {
  /** Stable, unique id; becomes `CalendarEntry.source` and the prefix of entry keys. */
  id: string;
  /** The legend chip's icon: the kind of entry this source mostly produces. */
  kind?: CalendarEntryKind;
  /** The legend chip's label, an i18n key such as `"waste:calendarSource"`. Defaults to `calendar:sources.<id>`. */
  labelKey?: string;
  load: (context: CalendarSourceContext) => Promise<CalendarOverlayItem[]>;
};

const sources = new Map<string, CalendarSource>();

export function registerCalendarSource(source: CalendarSource): void {
  if (source.id === "events") throw new Error('Calendar source id "events" is reserved for household events');
  // Re-registering the same id replaces it (dev server reloads); two features must not share an id.
  sources.set(source.id, source);
}

export const registeredCalendarSources = () => [...sources.values()];

/** The registered sources as the legend shows them, in registration order. */
export const calendarSourceInfos = (): CalendarSourceInfo[] =>
  registeredCalendarSources().map((source) => ({
    id: source.id,
    kind: source.kind ?? null,
    labelKey: source.labelKey ?? `calendar:sources.${source.id}`,
  }));

function toEntry(sourceId: string, item: CalendarOverlayItem): CalendarEntry {
  return {
    key: `${sourceId}:${item.id}`,
    source: sourceId,
    kind: item.kind,
    category: null,
    title: item.title,
    allDay: item.allDay,
    start: item.start,
    end: item.end ?? item.start,
    color: item.color ?? CALENDAR_KIND_COLORS[item.kind],
    participantIds: item.participantIds ?? [],
    location: item.location ?? null,
    readOnly: true,
    eventId: null,
    recurring: false,
    shop: null,
    href: item.href ?? null,
    meta: item.meta ?? null,
  };
}

/** Loads every registered source in parallel. A failing source is logged and left out. */
export async function loadOverlayEntries(context: CalendarSourceContext): Promise<CalendarEntry[]> {
  const list = registeredCalendarSources();
  const results = await Promise.allSettled(list.map((source) => source.load(context)));
  return results.flatMap((result, index) => {
    const source = list[index];
    if (!source) return [];
    if (result.status === "rejected") {
      console.error(`Calendar source "${source.id}" failed`, result.reason);
      return [];
    }
    return result.value.map((item) => toEntry(source.id, item));
  });
}

// ── Writers ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Calendar writers: other calendars a new event can go to instead of the household's own, without the calendar
 * knowing about them (a linked Google calendar). A writer lists the targets a person may write to and creates
 * an event in one; what it writes usually comes back through its own calendar source.
 */
export type CalendarWriterContext = { householdId: string; userId: string };

export type CalendarWriter = {
  /** Stable id; the prefix of its target ids (`<id>:<target id>`). */
  id: string;
  /** The person's targets, ids without the prefix. */
  targets: (context: CalendarWriterContext) => Promise<CalendarTarget[]>;
  /** Creates the event in one of the person's targets (`targetId` without the prefix); throws HttpErrors. */
  create: (context: CalendarWriterContext, targetId: string, input: CalendarEventInput) => Promise<void>;
};

const writers = new Map<string, CalendarWriter>();

export function registerCalendarWriter(writer: CalendarWriter): void {
  writers.set(writer.id, writer);
}

/** Every target the person may add events to, over all writers; a failing writer is logged and left out. */
export async function calendarTargets(context: CalendarWriterContext): Promise<CalendarTarget[]> {
  const list = [...writers.values()];
  const results = await Promise.allSettled(list.map((writer) => writer.targets(context)));
  return results.flatMap((result, index) => {
    const writer = list[index];
    if (!writer) return [];
    if (result.status === "rejected") {
      console.error(`Calendar writer "${writer.id}" failed`, result.reason);
      return [];
    }
    return result.value.map((target) => ({ ...target, id: `${writer.id}:${target.id}` }));
  });
}

/** The writer and its own target id of a `CalendarTarget` id, or null when no writer has that prefix. */
export function writerFor(targetId: string): { writer: CalendarWriter; id: string } | null {
  const separator = targetId.indexOf(":");
  if (separator <= 0) return null;
  const writer = writers.get(targetId.slice(0, separator));
  return writer ? { writer, id: targetId.slice(separator + 1) } : null;
}

// Built-in sources. Birthdays come from the household's habitants.
registerCalendarSource(birthdaysSource);
