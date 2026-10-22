import { calendarViewSchema, type CalendarView } from "../types/calendar";
import { matchesMedia, readStored, writeStored } from "@/lib/storage";

/*
 * The calendar view chosen on this device (localStorage), used when the URL names none (the menu link, the
 * dashboard). Without a choice: Day on phones (what's on today, at its hour, with the "now" line; one column
 * that fits any phone) and Month on larger screens. Storage can be off (private mode, Storybook): then
 * nothing is remembered and the device default applies.
 */

const STORAGE_KEY = "wh-calendar-view";
/** Below Tailwind's `md`: a phone. */
const PHONE_QUERY = "(max-width: 47.99rem)";

/** The view before anyone picks one on this device. */
export function defaultCalendarView(): CalendarView {
  return matchesMedia(PHONE_QUERY) ? "day" : "month";
}

/** The remembered view, else the device default. */
export function preferredCalendarView(): CalendarView {
  const stored = calendarViewSchema.safeParse(readStored(STORAGE_KEY));
  return stored.success ? stored.data : defaultCalendarView();
}

/** Remembers the view someone picked in the switcher. */
export const rememberCalendarView = (view: CalendarView): void => writeStored(STORAGE_KEY, view);
