import { calendarEventInputSchema, type CalendarCategory, type CalendarEvent, type CalendarEventInput } from "@/features/calendar/types/calendar";
import { addDays, daysBetween } from "@/types/dates";
import { repeatRule, type RepeatChoice } from "../tasks/task-input";

/**
 * Pure argument mapping for the calendar tools (tested without a database): a default end time, and the
 * full `CalendarEventInput` for an edit from the event as it is plus the changes asked for.
 */

/** One hour after `start` ("HH:MM"), at most 23:59 on the same day. */
export function plusOneHour(start: string): string {
  const hour = Number(start.slice(0, 2));
  return hour >= 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:${start.slice(3)}`;
}

export type EventChanges = {
  title?: string;
  /** New first day; without `endDate` the event keeps its length in days. */
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  category?: CalendarCategory | null;
  participantIds?: string[];
  repeat?: RepeatChoice;
};

export function mergeEventInput(event: CalendarEvent, changes: EventChanges): CalendarEventInput {
  const startDate = changes.date ?? event.startDate;
  const endDate = changes.endDate ?? (changes.date ? addDays(changes.date, daysBetween(event.startDate, event.endDate)) : event.endDate);
  const allDay = changes.allDay ?? (changes.startTime ? false : event.allDay);
  const startTime = allDay ? null : (changes.startTime ?? event.startTime);
  let endTime: string | null = null;
  if (!allDay) {
    if (changes.endTime) endTime = changes.endTime;
    else if (changes.startTime) endTime = event.startTime && event.endTime ? shiftEnd(event, changes.startTime) : plusOneHour(changes.startTime);
    else endTime = event.endTime ?? (startTime ? plusOneHour(startTime) : null);
  }
  const rule = repeatRule(changes.repeat, startDate);
  return calendarEventInputSchema.parse({
    kind: event.kind,
    title: changes.title ?? event.title,
    description: changes.description !== undefined ? changes.description : event.description,
    location: changes.location !== undefined ? changes.location : event.location,
    category: changes.category !== undefined ? changes.category : event.category,
    allDay,
    startDate,
    endDate,
    startTime,
    endTime,
    rrule: rule !== undefined ? rule : event.rrule,
    participantIds: changes.participantIds ?? event.participantIds,
    shopId: event.shop?.id ?? null,
  });
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** A new start time keeps the event's duration (same day only; capped at 23:59). */
function shiftEnd(event: CalendarEvent, newStart: string): string {
  if (!event.startTime || !event.endTime || event.startDate !== event.endDate) return plusOneHour(newStart);
  const length = Math.max(15, minutes(event.endTime) - minutes(event.startTime));
  return clock(Math.min(23 * 60 + 59, minutes(newStart) + length));
}
