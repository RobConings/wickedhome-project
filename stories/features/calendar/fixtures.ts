import type { CalendarScreenData, CalendarEventScreenData } from "@/features/calendar/data/calendar-loaders";
import {
  CALENDAR_KIND_COLORS,
  eventColor,
  type CalendarAgenda,
  type CalendarSourceInfo,
  type CalendarEntry,
  type CalendarEvent,
} from "@/features/calendar/types/calendar";
import { eventEntries, sortEntries } from "@/features/calendar/types/calendar-occurrences";
import { monthGridRange, type DateRange } from "@/features/calendar/types/calendar-time";
import type { Habitant } from "@/features/household/types/household";
import { habitantFixtures } from "../household/fixtures";
import { shopFixtures, shopListFixture, shopSelectionsFixture } from "../shops/fixtures";

/** Stories are set on Friday 2 October 2026, so the month and week views are full. */
export const TODAY = "2026-10-02";
/** 10:20 in Brussels on that day, for the week view's "now" line. */
export const NOW = new Date("2026-10-02T08:20:00.000Z");

/** A shop as store visits carry it (with its type and logo). */
const shopRef = ({ id, name, type, iconUrl }: (typeof shopFixtures)[keyof typeof shopFixtures]) => ({ id, name, type, iconUrl });

const grandma: Habitant = {
  id: "h5",
  name: "Oma Mieke",
  type: "guest",
  color: "#7c5cc4",
  emoji: "👵",
  birthday: "1956-10-21",
  hasAccount: false,
};

export const calendarHabitants: Habitant[] = [...Object.values(habitantFixtures), grandma];

const { owner: rob, partner: sofie, child: lena, pet: bram } = habitantFixtures;
const colorOf = (ids: string[]) => calendarHabitants.filter((habitant) => ids.includes(habitant.id)).map((h) => h.color);

type EventSeed = Omit<CalendarEvent, "color" | "description" | "location" | "category" | "rrule" | "shop" | "kind"> &
  Partial<Pick<CalendarEvent, "description" | "location" | "category" | "rrule" | "shop" | "kind">>;

function event(seed: EventSeed): CalendarEvent {
  const value = {
    kind: "event" as const,
    description: null,
    location: null,
    category: null,
    rrule: null,
    shop: null,
    ...seed,
  };
  return { ...value, color: eventColor({ ...value, participantColors: colorOf(value.participantIds) }) };
}

const timed = (date: string, startTime: string, endTime: string) => ({
  allDay: false,
  startDate: date,
  endDate: date,
  startTime,
  endTime,
});

export const calendarEventFixtures = {
  schoolRun: event({
    id: "e-school",
    title: "School drop-off",
    ...timed("2026-09-01", "08:15", "08:45"),
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR",
    participantIds: [lena.id, rob.id],
    category: "school",
    location: "Basisschool De Regenboog",
  }),
  swimming: event({
    id: "e-swimming",
    title: "Swimming lesson",
    ...timed("2026-09-02", "14:00", "15:00"),
    rrule: "FREQ=WEEKLY;BYDAY=WE",
    participantIds: [lena.id, sofie.id],
    category: "sport",
    location: "Zwembad Van Eyck, Gent",
  }),
  familyDinner: event({
    id: "e-dinner",
    title: "Family dinner at Oma's",
    ...timed("2026-10-04", "18:00", "21:00"),
    participantIds: [rob.id, sofie.id, lena.id],
    category: "family",
    location: "Kerkstraat 12, Gent",
    description: "Bring dessert. Lena wants to show her drawings.",
  }),
  vet: event({
    id: "e-vet",
    title: "Vet: vaccination",
    ...timed("2026-10-07", "11:00", "11:30"),
    participantIds: [bram.id, rob.id],
    category: "health",
    location: "Dierenartsenpraktijk Latem",
  }),
  gamma: event({
    id: "e-gamma",
    kind: "store_visit",
    title: "Gamma",
    ...timed("2026-10-10", "10:00", "11:00"),
    participantIds: [rob.id],
    shop: shopRef(shopFixtures.gamma),
    description: "Insulation boards for the jacuzzi, and a nail gun.",
  }),
  groceries: event({
    id: "e-colruyt",
    kind: "store_visit",
    title: "Weekly groceries",
    ...timed("2026-09-05", "09:00", "10:00"),
    rrule: "FREQ=WEEKLY;BYDAY=SA",
    participantIds: [sofie.id],
    shop: shopRef(shopFixtures.colruyt),
  }),
  dentist: event({
    id: "e-dentist",
    title: "Dentist",
    ...timed("2026-10-14", "16:30", "17:00"),
    participantIds: [sofie.id],
    category: "health",
  }),
  parentsEvening: event({
    id: "e-parents",
    title: "Parents' evening",
    ...timed("2026-10-02", "19:30", "21:00"),
    participantIds: [rob.id, sofie.id],
    category: "school",
  }),
  pmd: event({
    id: "e-pmd",
    title: "PMD bag outside",
    allDay: true,
    startDate: "2026-09-03",
    endDate: "2026-09-03",
    startTime: null,
    endTime: null,
    rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH",
    participantIds: [],
    category: "household",
  }),
  autumnBreak: event({
    id: "e-break",
    title: "Autumn break",
    allDay: true,
    startDate: "2026-10-26",
    endDate: "2026-11-01",
    startTime: null,
    endTime: null,
    participantIds: [],
    category: "school",
  }),
  /** A trip over a week boundary, overlapping the autumn break: two lanes of bars. */
  ardennes: event({
    id: "e-ardennes",
    title: "A week in the Ardennes",
    allDay: true,
    startDate: "2026-10-24",
    endDate: "2026-10-31",
    startTime: null,
    endTime: null,
    participantIds: [rob.id, sofie.id, lena.id, bram.id],
    category: "holiday",
    location: "Vakantiehuis Les Hêtres, Durbuy",
    description: "Hiking boots, rain gear and Bram's basket.",
  }),
  plopsaland: event({
    id: "e-plopsaland",
    title: "Family day at Plopsaland",
    allDay: true,
    startDate: "2026-10-18",
    endDate: "2026-10-18",
    startTime: null,
    endTime: null,
    participantIds: [rob.id, sofie.id, lena.id],
    category: "family",
    location: "Plopsaland De Panne",
  }),
  cousins: event({
    id: "e-cousins",
    title: "Cousins stay over",
    allDay: true,
    startDate: "2026-10-02",
    endDate: "2026-10-04",
    startTime: null,
    endTime: null,
    participantIds: [lena.id],
    category: "family",
  }),
  /** Timed, but longer than a day: also drawn as a bar. */
  lyon: event({
    id: "e-lyon",
    title: "Work trip to Lyon",
    allDay: false,
    startDate: "2026-10-07",
    endDate: "2026-10-09",
    startTime: "07:00",
    endTime: "19:00",
    participantIds: [sofie.id],
    category: "work",
    location: "Lyon",
  }),
  easter: event({
    id: "e-easter",
    title: "Easter holiday",
    allDay: true,
    startDate: "2027-03-29",
    endDate: "2027-04-11",
    startTime: null,
    endTime: null,
    participantIds: [],
    category: "holiday",
  }),
} satisfies Record<string, CalendarEvent>;

const overlay = (
  entry: Omit<CalendarEntry, "readOnly" | "eventId" | "recurring" | "shop" | "location" | "category">,
): CalendarEntry => ({
  readOnly: true,
  category: null,
  eventId: null,
  recurring: false,
  shop: null,
  location: null,
  ...entry,
});

/** Read-only entries from calendar sources: a birthday now, a bill as an example of a later source. */
export const overlayFixtures = {
  grandmaBirthday: overlay({
    key: "birthdays:h5:2026",
    source: "birthdays",
    kind: "birthday",
    title: grandma.name,
    allDay: true,
    start: "2026-10-21",
    end: "2026-10-21",
    color: grandma.color,
    participantIds: [grandma.id],
    href: "/habitants",
    meta: { age: 70 },
  }),
  electricityBill: overlay({
    key: "expenses:e-engie-2026-10",
    source: "expenses",
    kind: "bill",
    title: "Engie · € 142,00",
    allDay: true,
    start: "2026-10-15",
    end: "2026-10-15",
    color: CALENDAR_KIND_COLORS.bill,
    participantIds: [],
    href: "/expenses/e-engie-2026-10",
    meta: { status: "upcoming", amountCents: 14200 },
  }),
  paperCollection: overlay({
    key: "waste:2026-10-07",
    source: "waste",
    kind: "waste",
    title: "Papier & karton",
    allDay: true,
    start: "2026-10-07",
    end: "2026-10-07",
    color: CALENDAR_KIND_COLORS.waste,
    participantIds: [],
    href: "/settings#waste",
    meta: { fractions: "paper" },
  }),
  /** A linked task with a time (20:00 the evening before): it sits at its hour in the day and week views. */
  binsTask: overlay({
    key: "tasks:t-bins",
    source: "tasks",
    kind: "task",
    title: "Put out: Papier & karton",
    allDay: false,
    start: "2026-10-06T18:00:00.000Z",
    end: "2026-10-06T18:30:00.000Z",
    color: CALENDAR_KIND_COLORS.task,
    participantIds: [],
    href: "/tasks/t-bins",
    meta: { type: "chore", priority: "normal" },
  }),
  /** "Remind me at 21:00 to put the bins out": a task with a time and a reminder, today. */
  reminderTask: overlay({
    key: "tasks:t-reminder",
    source: "tasks",
    kind: "task",
    title: "Put the bins out",
    allDay: false,
    start: "2026-10-02T19:00:00.000Z",
    end: "2026-10-02T19:30:00.000Z",
    color: CALENDAR_KIND_COLORS.task,
    participantIds: [habitantFixtures.owner.id],
    href: "/tasks/t-reminder",
    meta: { type: "todo", priority: "normal", reminder: 1 },
  }),
  /** A task due today without a time: in the all-day row. */
  insurerTask: overlay({
    key: "tasks:t-insurer",
    source: "tasks",
    kind: "task",
    title: "Call the insurer",
    allDay: true,
    start: "2026-10-02",
    end: "2026-10-02",
    color: CALENDAR_KIND_COLORS.task,
    participantIds: [habitantFixtures.partner.id],
    href: "/tasks/t-insurer",
    meta: { type: "todo", priority: "high" },
  }),
} satisfies Record<string, CalendarEntry>;

/** The overlay sources the API registers, for the legend's source chips. */
export const calendarSourceFixtures: CalendarSourceInfo[] = [
  { id: "birthdays", kind: "birthday", labelKey: "calendar:sources.birthdays" },
  { id: "tasks", kind: "task", labelKey: "calendar:sources.tasks" },
  { id: "waste", kind: "waste", labelKey: "waste:calendarSource" },
  { id: "expenses", kind: null, labelKey: "calendar:sources.expenses" },
];

/** An agenda as the API would return it for `range`, from the fixture events and overlays. */
export function buildAgenda(
  range: DateRange,
  events: CalendarEvent[] = Object.values(calendarEventFixtures),
  overlays: CalendarEntry[] = Object.values(overlayFixtures),
): CalendarAgenda {
  const entries = events.flatMap((item) => eventEntries(item, range));
  const used = new Set(entries.map((entry) => entry.eventId));
  const inRange = overlays.filter((entry) => entry.end >= range.from && entry.start <= range.to);
  return {
    ...range,
    entries: sortEntries([...entries, ...inRange]),
    events: events.filter((item) => used.has(item.id)),
    sources: calendarSourceFixtures,
  };
}

export const octoberAgenda = buildAgenda(monthGridRange(TODAY));
/** April 2027: the Easter holiday spans two week rows. */
export const EASTER_DATE = "2027-04-05";
export const easterAgenda = buildAgenda(monthGridRange(EASTER_DATE));

export const calendarShops = shopListFixture;
export const calendarShopSelections = shopSelectionsFixture;

export const calendarScreenFixture: CalendarScreenData = {
  view: "month",
  date: TODAY,
  today: TODAY,
  agenda: octoberAgenda,
  habitants: calendarHabitants,
  shops: calendarShops,
};

export const calendarEventScreenFixture: CalendarEventScreenData = {
  event: calendarEventFixtures.gamma,
  today: TODAY,
  habitants: calendarHabitants,
  shops: calendarShops,
};

/** Look up a fixture entry by its key, e.g. `entryFixture("event:e-gamma")`. */
export function entryFixture(key: string): CalendarEntry {
  const entry = octoberAgenda.entries.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`No fixture entry ${key}`);
  return entry;
}
