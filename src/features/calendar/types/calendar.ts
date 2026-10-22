import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import { daysBetween } from "@/types/dates";
import { isValidRRule, type RRuleSupport } from "@/types/recurrence";
import type { ShopRef } from "@/types/shops";

/**
 * The RRULE subset calendar events accept (`@/types/recurrence`): daily, weekly (optionally on chosen
 * weekdays), monthly and yearly, with COUNT or UNTIL. No seasonal windows. Months without the start day
 * are skipped, as the RFC says (the default `monthEnd: "skip"`).
 */
export const CALENDAR_RRULE_SUPPORT = { seasons: false } as const satisfies RRuleSupport;

// ── Enums ─────────────────────────────────────────────────────────────────────────────────────────────

/** Events the household creates. A store visit is an event linked to a shop. */
export const CALENDAR_EVENT_KINDS = ["event", "store_visit"] as const;
export const calendarEventKindSchema = z.enum(CALENDAR_EVENT_KINDS);
export type CalendarEventKind = z.infer<typeof calendarEventKindSchema>;

/** What an event is about. "family" is a family activity; "holiday" covers holidays, trips and weekends away. */
export const CALENDAR_CATEGORIES = [
  "family",
  "holiday",
  "school",
  "work",
  "health",
  "social",
  "sport",
  "household",
  "other",
] as const;
export const calendarCategorySchema = z.enum(CALENDAR_CATEGORIES);
export type CalendarCategory = z.infer<typeof calendarCategorySchema>;

/**
 * Everything that can appear on the calendar: the household's own events plus read-only overlays that
 * other features contribute through a calendar source (see src/api/calendar/calendar-sources.ts).
 * A feature adding a new kind of overlay adds it here, with a label in the calendar's locales.
 */
export const CALENDAR_ENTRY_KINDS = ["event", "store_visit", "birthday", "task", "bill", "renewal", "waste", "other"] as const;
export const calendarEntryKindSchema = z.enum(CALENDAR_ENTRY_KINDS);
export type CalendarEntryKind = z.infer<typeof calendarEntryKindSchema>;

/** Day and week: an hour grid (phones list the week per day); month: a grid (phones: compact month + agenda). */
export const CALENDAR_VIEWS = ["day", "week", "month", "agenda"] as const;
export const calendarViewSchema = z.enum(CALENDAR_VIEWS);
export type CalendarView = z.infer<typeof calendarViewSchema>;

// ── Colours ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * One distinct colour per category, as design tokens (`src/styles/index.css`) so light and dark mode each
 * get their tuned value. CSS colour values: use them in `style`, also inside `color-mix()`.
 */
export const CALENDAR_CATEGORY_COLORS: Record<CalendarCategory, string> = {
  family: "var(--chart-3)",
  holiday: "var(--chart-2)",
  school: "var(--chart-1)",
  work: "var(--chart-7)",
  health: "var(--chart-8)",
  social: "var(--chart-5)",
  sport: "var(--chart-4)",
  household: "var(--brand-leaf)",
  other: "var(--muted-foreground)",
};

/** Default colour per entry kind, when nothing more specific applies. */
export const CALENDAR_KIND_COLORS: Record<CalendarEntryKind, string> = {
  event: "#124734",
  store_visit: "#d9912b",
  birthday: "#c2508a",
  task: "#3b82b6",
  bill: "#d4573b",
  renewal: "#7c5cc4",
  waste: "#5f7d3a",
  other: "#6b7280",
};

/**
 * An event takes the colour of its category, so the calendar reads by category (see the legend); without
 * one, the colour of its first participant, else its kind.
 */
export function eventColor(event: {
  kind: CalendarEventKind;
  category: CalendarCategory | null;
  participantColors: string[];
}): string {
  return (
    (event.category ? CALENDAR_CATEGORY_COLORS[event.category] : undefined) ??
    event.participantColors[0] ??
    CALENDAR_KIND_COLORS[event.kind]
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────────────────────────────

/** `HH:MM`, 24 h. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Longest event we accept, so a typo in the year doesn't create a 900-year event. */
export const MAX_EVENT_DAYS = 366;

/**
 * Error messages this schema produces itself. They are codes, not text: the form translates them
 * (`calendar:errors.<code>`); zod's own messages are already localised.
 */
export const CALENDAR_ERROR_CODES = [
  "timeRequired",
  "endBeforeStart",
  "tooLong",
  "shopRequired",
  "invalidRecurrence",
  "unknownParticipant",
  "unknownShop",
  "unknownTarget",
] as const;
export type CalendarErrorCode = (typeof CALENDAR_ERROR_CODES)[number];

/** `CalendarEventInput.target` for the household's own calendar (also what an absent target means). */
export const HOUSEHOLD_TARGET = "household";

/**
 * Body of `POST /api/calendar/events` and `PUT /api/calendar/events/:id`. Dates and times are wall-clock
 * values in the household time zone; the API converts timed events to instants. `endDate` is inclusive.
 * `target` (create only): where the event goes, `household` (default) or a `CalendarTarget` id such as a
 * linked Google calendar; there it is a plain event (no kind, category or participants).
 */
export const calendarEventInputSchema = z
  .object({
    kind: calendarEventKindSchema.default("event"),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    location: z.string().trim().max(200).optional().nullable(),
    category: calendarCategorySchema.optional().nullable(),
    allDay: z.boolean().default(false),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    startTime: timeOfDaySchema.optional().nullable(),
    endTime: timeOfDaySchema.optional().nullable(),
    rrule: z
      .string()
      .trim()
      .max(200)
      .refine((rule) => isValidRRule(rule, CALENDAR_RRULE_SUPPORT), { message: "invalidRecurrence" })
      .optional()
      .nullable(),
    participantIds: z.array(idSchema).max(30).default([]),
    shopId: idSchema.optional().nullable(),
    target: z.string().trim().max(200).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.allDay) {
      if (!value.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "timeRequired" });
      if (!value.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "timeRequired" });
    }
    if (value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
    } else if (
      !value.allDay &&
      value.endDate === value.startDate &&
      value.startTime &&
      value.endTime &&
      value.endTime <= value.startTime
    ) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "endBeforeStart" });
    } else if (daysBetween(value.startDate, value.endDate) > MAX_EVENT_DAYS) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "tooLong" });
    }
    if (value.kind === "store_visit" && !value.shopId) {
      ctx.addIssue({ code: "custom", path: ["shopId"], message: "shopRequired" });
    }
  });
export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

/** Longest range one agenda request may cover (a month grid is at most 42 days). */
export const MAX_AGENDA_DAYS = 120;

const rangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((range) => range.to >= range.from && daysBetween(range.from, range.to) <= MAX_AGENDA_DAYS, {
    message: `to must be on or after from, at most ${MAX_AGENDA_DAYS} days later`,
    path: ["to"],
  });

/** Query string of `GET /api/calendar/agenda`. Both dates inclusive. */
export const agendaQuerySchema = rangeSchema;
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

/** Query string of `GET /api/calendar/store-visits`. Defaults: today until 60 days later. */
export const storeVisitQuerySchema = z.object({
  shopId: idSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type StoreVisitQuery = z.infer<typeof storeVisitQuerySchema>;

// ── Output ────────────────────────────────────────────────────────────────────────────────────────────

/** The shop of a store visit, with its type and logo so `ShopBadge` shows the real logo. */
export type CalendarShopRef = ShopRef;

/** A household event as stored: one row, even when it recurs. */
export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  location: string | null;
  category: CalendarCategory | null;
  allDay: boolean;
  /** Wall-clock values in the household time zone. Times are `null` for all-day events. */
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  /** RFC 5545 RRULE without DTSTART (= `startDate`), or `null`. */
  rrule: string | null;
  /** Ordered: the first participant colours the event. */
  participantIds: string[];
  /** Store visits only. */
  shop: CalendarShopRef | null;
  color: string;
};

/**
 * One thing shown on the calendar on a given day: an occurrence of a household event, or a read-only
 * overlay from another feature (birthdays now; tasks, bills and renewals later).
 */
export type CalendarEntry = {
  /** Unique within an agenda: `event:<id>[:<date>]` or `<source>:<item id>`. */
  key: string;
  /** `"events"` for household events, otherwise the id of the calendar source that produced it. */
  source: string;
  kind: CalendarEntryKind;
  /** Household events only; overlays from other features have none. */
  category: CalendarCategory | null;
  title: string;
  allDay: boolean;
  /** All-day: first day `YYYY-MM-DD`. Timed: ISO timestamp. */
  start: string;
  /** All-day: last day `YYYY-MM-DD` (inclusive). Timed: ISO timestamp. */
  end: string;
  color: string;
  participantIds: string[];
  location: string | null;
  /** Overlays are read-only; open `href` to change them in their own feature. */
  readOnly: boolean;
  /** Household events: the event this occurrence belongs to. */
  eventId: string | null;
  recurring: boolean;
  shop: CalendarShopRef | null;
  /** Where the item lives in its own feature, e.g. `/habitants`. */
  href: string | null;
  /** Kind-specific extras, e.g. `{ age: 10 }` for a birthday. */
  meta: Record<string, string | number> | null;
};

/** `GET /api/calendar/agenda`: entries sorted by start, plus the household events they come from. */
export type CalendarAgenda = {
  from: string;
  to: string;
  entries: CalendarEntry[];
  events: CalendarEvent[];
  /** The registered overlay sources (birthdays, tasks, waste, expenses…), for the legend's source chips. */
  sources: CalendarSourceInfo[];
  /** Other calendars the viewer can add events to (their own writable Google calendars), for the event form. */
  targets?: CalendarTarget[];
};

/**
 * A calendar a new event can go to besides the household's own: one the viewer may write to in another
 * feature (a linked Google calendar). Registered as a calendar writer (src/api/calendar/calendar-sources.ts).
 */
export type CalendarTarget = {
  /** `<writer id>:<its target id>`, e.g. `google:<calendar id>`; `CalendarEventInput.target`. */
  id: string;
  label: string;
  /** `#rrggbb`, or null. */
  color: string | null;
  /** The account it belongs to (e.g. a Google address), to tell same-named calendars apart. */
  account: string | null;
};

/** Whether an input goes to another calendar than the household's own. */
export const isExternalTarget = (target: string | null | undefined): target is string => Boolean(target) && target !== HOUSEHOLD_TARGET;

/** A calendar source as the legend shows it: id (`CalendarEntry.source`), icon (an entry kind) and label. */
export type CalendarSourceInfo = {
  id: string;
  /** `null`: use the kind of the source's entries. */
  kind: CalendarEntryKind | null;
  /** i18n key, e.g. `"waste:calendarSource"` or `"calendar:sources.tasks"`. */
  labelKey: string;
};

/**
 * What a calendar source (another feature's overlay) returns per item. The calendar turns it into a
 * read-only `CalendarEntry`. Dates follow `CalendarEntry`: `YYYY-MM-DD` when all-day, ISO otherwise.
 */
export type CalendarOverlayItem = {
  /** Unique within the source, e.g. a task id, or `<habitant id>:<year>` for a birthday. */
  id: string;
  kind: CalendarEntryKind;
  title: string;
  allDay: boolean;
  start: string;
  /** Defaults to `start`. */
  end?: string;
  /** Defaults to the first participant's colour, else the kind colour. */
  color?: string | null;
  participantIds?: string[];
  location?: string | null;
  href?: string | null;
  meta?: Record<string, string | number> | null;
};

/**
 * The store-visit contract for Shopping: `GET /api/calendar/store-visits?shopId=` lists upcoming
 * visits (one per occurrence). Link to a visit with `calendarEventPath(eventId)`.
 */
export type StoreVisit = {
  eventId: string;
  /** Occurrence key, unique per occurrence of a recurring visit. */
  key: string;
  title: string;
  shop: CalendarShopRef;
  allDay: boolean;
  start: string;
  end: string;
  recurring: boolean;
};

// ── Category filter ───────────────────────────────────────────────────────────────────────────────

/** Search parameter of the calendar page holding the category filter, e.g. `?categories=holiday,family`. */
export const CATEGORY_FILTER_PARAM = "categories";

/** The categories in a filter value (comma-separated); unknown ones are ignored. Empty means "everything". */
export function parseCategoryFilter(value: string | null | undefined): CalendarCategory[] {
  if (!value) return [];
  const wanted = new Set(value.split(","));
  return CALENDAR_CATEGORIES.filter((category) => wanted.has(category));
}

/**
 * Whether an entry passes a category filter. Uncategorised household events count as "other"; overlays
 * from other features (birthdays, tasks, bills…) have no category and are hidden while filtering.
 */
export function matchesCategoryFilter(
  entry: Pick<CalendarEntry, "source" | "category">,
  categories: readonly CalendarCategory[],
): boolean {
  if (categories.length === 0) return true;
  const category = entry.category ?? (entry.source === "events" ? "other" : null);
  return category !== null && categories.includes(category);
}

/** Search parameter holding the source filter, e.g. `?sources=waste,tasks`. */
export const SOURCE_FILTER_PARAM = "sources";

/** The source ids in a filter value (comma-separated, de-duplicated, in the given order). Empty means "everything". */
export function parseSourceFilter(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter((id) => /^[a-z0-9_-]{1,40}$/.test(id)))];
}

/**
 * The legend filter: categories (household events) and sources (overlays from other features) together.
 * Nothing selected shows everything; otherwise an entry shows when it matches any selected chip: a household
 * event by its category (uncategorised = "other"), an overlay by its source.
 */
export function matchesCalendarFilter(
  entry: Pick<CalendarEntry, "source" | "category">,
  categories: readonly CalendarCategory[],
  sources: readonly string[],
): boolean {
  if (categories.length === 0 && sources.length === 0) return true;
  if (entry.source === "events") return matchesCategoryFilter(entry, categories) && categories.length > 0;
  return sources.includes(entry.source) || (entry.category !== null && categories.includes(entry.category));
}

export const calendarEventPath = (eventId: string) => `/calendar/events/${encodeURIComponent(eventId)}`;

/** Adults and owners create and change events; children look. Mirrors the API's role check. */
export const canManageCalendar = (role: "owner" | "adult" | "child") => role !== "child";
