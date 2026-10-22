import { z } from "zod";
import { CALENDAR_CATEGORIES, CALENDAR_ENTRY_KINDS, calendarEventInputSchema, type CalendarEntry } from "@/features/calendar/types/calendar";
import { formatTime } from "@/types/date-format";
import { addDays, daysBetween, HOUSEHOLD_TIME_ZONE, todayIn } from "@/types/dates";
import { badRequest } from "@/api/lib/http";
import { calendarTargets } from "@/api/calendar/calendar-sources";
import { createEventIn, deleteEvent, getAgenda, getEvent, updateEvent } from "@/api/calendar/calendar.service";
import {
  capList,
  dateSchema,
  day,
  done,
  entityNames,
  entityRef,
  optionalDateSchema,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  timeSchema,
  type AssistantToolContext,
} from "@ai/core/kit";
import { nameScore } from "@ai/core/text-match";
import { REPEAT_CHOICES, repeatRule } from "../tasks/task-input";
import { mergeEventInput, plusOneHour } from "./event-input";

/** Skill "calendar": the household agenda and its events (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "calendar",
  title: { en: "Calendar", nl: "Agenda" },
  summary: "The household agenda: events, birthdays, and what other areas put on it (tasks, bills, waste, Google); add, change, delete events.",
  keywords: {
    nl: ["agenda", "kalender", "afspraak", "afspraken", "evenement", "verjaardag", "verplaats", "verzet", "annuleer", "afgelast", "winkelbezoek"],
    en: ["calendar", "agenda", "appointment", "event", "schedule", "birthday", "dinner", "party", "reschedule", "cancel the", "store visit"],
  },
  // Dates and "when" belong to every area ("wat is het weer morgen", "wanneer is de ophaling"): they route a
  // question here only when nothing else matches, and never count as a question of their own.
  hints: {
    nl: ["vandaag", "morgen", "overmorgen", "deze week", "volgende week", "weekend", "wanneer", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
    en: ["today", "tomorrow", "this week", "next week", "weekend", "when", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  },
});

const MAX_DAYS = 31;
const ENTRY_LIMIT = 40;

const localTime = (iso: string) => formatTime(iso, HOUSEHOLD_TIME_ZONE);
const localDate = (iso: string) => todayIn(HOUSEHOLD_TIME_ZONE, new Date(iso));

/** A short extra for overlays: a bill's status and amount, a birthday's age, the Google calendar's name. */
function extraOf(entry: CalendarEntry): string | null {
  const meta = entry.meta ?? {};
  if (entry.kind === "bill" && meta.status) return String(meta.status);
  if (entry.kind === "birthday" && meta.age !== undefined) return `turns ${meta.age}`;
  if (entry.source === "google" && meta.calendar) return `Google: ${meta.calendar}`;
  if (entry.kind === "task" && meta.projected) return "planned repeat";
  return null;
}

const compact = (entry: CalendarEntry, names: Map<string, string>) => {
  const date = entry.allDay ? entry.start : localDate(entry.start);
  const endDate = entry.allDay ? entry.end : localDate(entry.end);
  return {
    title: entry.title,
    kind: entry.kind,
    date,
    until: endDate !== date ? endDate : null,
    time: entry.allDay ? null : `${localTime(entry.start)}–${localTime(entry.end)}`,
    who: entry.participantIds.length ? entry.participantIds.map((id) => names.get(id) ?? "?") : null,
    location: entry.location,
    shop: entry.shop?.name,
    repeats: entry.recurring || null,
    note: extraOf(entry),
  };
};

registerEntityResolver({
  type: "event",
  label: "event",
  skill: "calendar",
  // Household events from 2 weeks ago to 3 months ahead: what people refer to by name.
  search: async (ctx) => {
    const today = todayIn();
    const agenda = await getAgenda(ctx.householdId, { from: addDays(today, -14), to: addDays(today, 90) }, ctx.user.id);
    const seen = new Set<string>();
    return agenda.entries.flatMap((entry) => {
      // A recurring event is one series: offer its first occurrence in the window once.
      if (!entry.eventId || seen.has(entry.eventId)) return [];
      seen.add(entry.eventId);
      const date = entry.allDay ? entry.start : localDate(entry.start);
      return [{ id: entry.eventId, name: entry.title, date, hint: day(date, ctx.locale) ?? undefined }];
    });
  },
});

registerAssistantTool({
  name: "calendar.agenda",
  description:
    "The household agenda for a date range: events, birthdays, tasks due, bills due, waste collection, projects, Google calendars. Default: today. For 'what's on today/this week', 'when is…'.",
  input: z.object({
    from: optionalDateSchema("First day YYYY-MM-DD (default today)"),
    to: optionalDateSchema("Last day YYYY-MM-DD, inclusive (default = from; at most 31 days)"),
    kinds: z.array(z.enum(CALENDAR_ENTRY_KINDS)).max(8).optional().describe("Only these kinds, e.g. ['birthday'] or ['bill','waste']"),
    person: entityRef("habitant", "Only what involves this person").optional(),
  }),
  permission: "read",
  confirm: "never",
  core: true,
  activity: { en: "Checked the agenda", nl: "Agenda bekeken" },
  run: async (ctx, input) => {
    const from = input.from ?? todayIn();
    let to = input.to ?? from;
    if (to < from) throw badRequest("to must be on or after from");
    if (daysBetween(from, to) > MAX_DAYS) to = addDays(from, MAX_DAYS);
    const [agenda, names] = await Promise.all([getAgenda(ctx.householdId, { from, to }, ctx.user.id), entityNames(ctx, "habitant")]);
    const entries = agenda.entries.filter(
      (entry) => (!input.kinds?.length || input.kinds.includes(entry.kind)) && (!input.person || entry.participantIds.includes(input.person.id)),
    );
    return { from, to, ...capList(entries, ENTRY_LIMIT, (entry) => compact(entry, names)) };
  },
});

const eventFields = {
  location: z.string().trim().max(200).optional(),
  participants: z.array(entityRef("habitant", "First name or 'me'")).max(10).optional(),
  repeat: z.enum(REPEAT_CHOICES).optional().describe("From the date; none = once"),
};

const timeText = (startTime?: string | null, endTime?: string | null) => (startTime ? ` ${startTime}${endTime ? `–${endTime}` : ""}` : "");

/**
 * The calendar a new event goes to, by what the person called it ("werk", "Gezin", an address): the best match
 * over the names and accounts of their writable Google calendars. None or a tie is an error listing them.
 */
async function targetNamed(ctx: AssistantToolContext, name: string) {
  const targets = await calendarTargets({ householdId: ctx.householdId, userId: ctx.user.id });
  const scored = targets
    .map((target) => ({ target, score: Math.max(nameScore(name, target.label), target.account ? nameScore(name, target.account) : 0) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  const list = targets.map((target) => `“${target.label}”${target.account ? ` (${target.account})` : ""}`).join(", ");
  if (!scored.length) throw badRequest(targets.length ? `No calendar called “${name}”. Choose one of: ${list}` : "No Google calendar to add events to (link one with writing allowed)");
  if (scored[1] && scored[1].score === scored[0]?.score) throw badRequest(`Which calendar: ${scored.filter((candidate) => candidate.score === scored[0]?.score).map((candidate) => `“${candidate.target.label}”`).join(" or ")}?`);
  return scored[0]?.target ?? null;
}

registerAssistantTool({
  name: "calendar.calendars",
  description: "The calendars a new event can go to besides the household calendar: the person's Google calendars they may write to (name, account).",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked which calendars I can add to", nl: "Agenda's bekeken" },
  run: async (ctx) => {
    const targets = await calendarTargets({ householdId: ctx.householdId, userId: ctx.user.id });
    return { calendars: targets.map((target) => ({ name: target.label, account: target.account })) };
  },
});

registerAssistantTool({
  name: "calendar.add_event",
  description:
    "Add an event to the household calendar (published to Google when linked), or with `calendar` straight into one of the person's Google calendars. Without a start time it is all-day. With a shop it is a store visit.",
  input: z.object({
    title: z.string().trim().min(1).max(120),
    date: dateSchema("Day YYYY-MM-DD"),
    endDate: optionalDateSchema("Last day, multi-day events"),
    startTime: timeSchema().optional(),
    endTime: timeSchema("HH:MM; default start + 1 h").optional(),
    ...eventFields,
    shop: entityRef("shop", "Store visit: the shop").optional(),
    calendar: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("A Google calendar of the person, by name or address (calendar_calendars); default the household calendar"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Added an event to the calendar", nl: "Afspraak in de agenda gezet" },
  describe: (ctx, input) => {
    const when = day(input.date, ctx.locale, true);
    const time = input.startTime ? timeText(input.startTime, input.endTime) : say(ctx.locale, " (all day)", " (hele dag)");
    const who = input.participants?.length ? ` · ${input.participants.map((person) => person.name).join(", ")}` : "";
    const repeat = input.repeat && input.repeat !== "none" ? say(ctx.locale, `, repeats ${input.repeat}`, `, herhaalt ${input.repeat}`) : "";
    const where = input.calendar ? say(ctx.locale, ` in Google calendar “${input.calendar}”`, ` in Google-agenda “${input.calendar}”`) : "";
    return say(ctx.locale, `Add “${input.title}” on ${when}${time}${who}${repeat}${where}`, `“${input.title}” in de agenda op ${when}${time}${who}${repeat}${where}`);
  },
  run: async (ctx, input) => {
    const allDay = !input.startTime;
    const target = input.calendar ? await targetNamed(ctx, input.calendar) : null;
    const event = await createEventIn(
      ctx.householdId,
      ctx.user.id,
      calendarEventInputSchema.parse({
        kind: input.shop ? "store_visit" : "event",
        title: input.title,
        allDay,
        startDate: input.date,
        endDate: input.endDate ?? input.date,
        startTime: allDay ? null : input.startTime,
        endTime: allDay ? null : (input.endTime ?? plusOneHour(input.startTime ?? "00:00")),
        location: input.location ?? null,
        rrule: repeatRule(input.repeat, input.date) ?? null,
        participantIds: (input.participants ?? []).map((person) => person.id),
        shopId: input.shop?.id ?? null,
        target: target?.id ?? null,
      }),
    );
    if (!event) return done(`Added “${input.title}” on ${day(input.date)}${input.startTime ? ` ${input.startTime}` : ""} to Google calendar “${target?.label ?? input.calendar}”.`);
    return done(`Added “${event.title}” on ${day(event.startDate)}${event.startTime ? ` ${event.startTime}` : ""}.`, { id: event.id });
  },
});

registerAssistantTool({
  name: "calendar.update_event",
  description: "Change a household event (recurring: the whole series); only what is given changes. Not for tasks, bills, birthdays or waste.",
  input: z.object({
    event: entityRef("event"),
    title: z.string().trim().min(1).max(120).optional(),
    date: optionalDateSchema("New first day (keeps the length)"),
    endDate: optionalDateSchema("New last day"),
    startTime: timeSchema().optional(),
    endTime: timeSchema().optional(),
    allDay: z.boolean().optional(),
    ...eventFields,
    description: z.string().trim().max(2000).optional(),
    category: z.enum(CALENDAR_CATEGORIES).optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed an event", nl: "Afspraak aangepast" },
  describe: (ctx, input) => {
    const changes = [
      input.title && `“${input.title}”`,
      input.date && day(input.date, ctx.locale, true),
      input.startTime && timeText(input.startTime, input.endTime).trim(),
      !input.startTime && input.endTime && say(ctx.locale, `until ${input.endTime}`, `tot ${input.endTime}`),
      input.allDay && say(ctx.locale, "all day", "hele dag"),
      input.location,
      input.participants && input.participants.map((person) => person.name).join(", "),
      input.repeat && say(ctx.locale, `repeat: ${input.repeat}`, `herhaling: ${input.repeat}`),
    ].filter(Boolean);
    return say(ctx.locale, `Change “${input.event.name}”: ${changes.join(", ")}`, `“${input.event.name}” aanpassen: ${changes.join(", ")}`);
  },
  run: async (ctx, input) => {
    const event = await getEvent(ctx.householdId, input.event.id);
    const updated = await updateEvent(
      ctx.householdId,
      event.id,
      mergeEventInput(event, {
        title: input.title,
        date: input.date,
        endDate: input.endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        allDay: input.allDay,
        location: input.location,
        description: input.description,
        category: input.category,
        participantIds: input.participants?.map((person) => person.id),
        repeat: input.repeat,
      }),
    );
    return done(`Changed “${updated.title}”: ${day(updated.startDate)}${updated.startTime ? ` ${updated.startTime}–${updated.endTime}` : ""}.`, { id: updated.id });
  },
});

registerAssistantTool({
  name: "calendar.delete_event",
  description: "Delete a household event (a recurring event: the whole series).",
  input: z.object({ event: entityRef("event") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted an event", nl: "Afspraak verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete “${input.event.name}” from the calendar`, `“${input.event.name}” uit de agenda verwijderen`),
  preview: async (ctx, input) => {
    const event = await getEvent(ctx.householdId, input.event.id);
    const names = await entityNames(ctx, "habitant");
    const fields = [
      { label: say(ctx.locale, "Event", "Afspraak"), value: event.title },
      { label: say(ctx.locale, "When", "Wanneer"), value: `${day(event.startDate, ctx.locale, true) ?? ""}${timeText(event.startTime, event.endTime)}` },
      event.rrule && { label: say(ctx.locale, "Repeats", "Herhaalt"), value: say(ctx.locale, "the whole series goes", "de hele reeks verdwijnt") },
      event.participantIds.length && { label: say(ctx.locale, "People", "Personen"), value: event.participantIds.map((id) => names.get(id) ?? "?").join(", ") },
    ].filter((field): field is { label: string; value: string } => Boolean(field));
    return { kind: "fields", data: { fields } };
  },
  run: async (ctx, input) => {
    await deleteEvent(ctx.householdId, input.event.id);
    return done(`Deleted “${input.event.name}”.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): an event's page and the calendar ──

registerScreenContext({
  kind: "event",
  skills: ["calendar"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const event = await getEvent(ctx.householdId, id);
    const when = [day(event.startDate), !event.allDay && event.startTime, event.rrule && "repeats"].filter(Boolean).join(" ");
    return { label: event.title, summary: `calendar event "${event.title}" (${when}${event.location ? `, at "${event.location}"` : ""})` };
  },
});

registerScreenContext({
  kind: "calendar",
  skills: ["calendar"],
  describe: (ctx) => ({ label: say(ctx.locale, "Calendar", "Agenda"), summary: "the calendar" }),
});
