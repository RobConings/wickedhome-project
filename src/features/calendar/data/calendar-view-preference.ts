import { calendarViewSchema, type CalendarView } from "../types/calendar";

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
  try {
    return window.matchMedia(PHONE_QUERY).matches ? "day" : "month";
  } catch {
    return "month";
  }
}

/** The remembered view, else the device default. */
export function preferredCalendarView(): CalendarView {
  try {
    const stored = calendarViewSchema.safeParse(localStorage.getItem(STORAGE_KEY));
    if (stored.success) return stored.data;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return defaultCalendarView();
}

/** Remembers the view someone picked in the switcher. */
export function rememberCalendarView(view: CalendarView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Not remembered; harmless.
  }
}
