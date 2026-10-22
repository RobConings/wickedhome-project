import type { CalendarEntry } from "../types/calendar";
import { datesInRange, weekRange } from "../types/calendar-time";
import { CalendarTimeGrid } from "./calendar-time-grid";

type CalendarWeekGridProps = {
  /** Any date in the week to show (weeks start on Monday). */
  date: string;
  today: string;
  entries: CalendarEntry[];
  onSelectEntry: (entry: CalendarEntry) => void;
  /** Called with the day and the clicked hour (`HH:00`); omit when the user can't add events. */
  onAddAt?: (date: string, time: string) => void;
  /** Hour the grid scrolls to initially (default: just before now this week, else 07:00). */
  scrollToHour?: number;
  /** Current time, for the "now" line (defaults to the real clock; fixed in stories). */
  now?: Date;
  className?: string;
};

/**
 * Monday-to-Sunday time grid with an all-day row (a `CalendarTimeGrid` of seven days). Overlapping events sit
 * side by side; multi-day entries (trips, holidays, anything of 24 hours or more) run as bars across the
 * all-day row, stacked in lanes. Larger screens; phones list the week per day (`CalendarAgendaList`).
 */
export function CalendarWeekGrid({ date, ...props }: CalendarWeekGridProps) {
  return <CalendarTimeGrid days={datesInRange(weekRange(date))} {...props} />;
}

/** One day as a time grid: the all-day row on top, the hours below, the "now" line when it is today. */
export function CalendarDayGrid({ date, ...props }: CalendarWeekGridProps) {
  return <CalendarTimeGrid days={[date]} {...props} />;
}
