import * as React from "react";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "../types/calendar";
import { datesInRange, monthGridRange } from "../types/calendar-time";
import { formatDayHeading, groupEntriesByDate, weekdayLabels } from "./calendar-format";

type CalendarCompactMonthProps = {
  /** Any date in the month to show. */
  date: string;
  today: string;
  entries: CalendarEntry[];
  selectedDate?: string | null;
  onSelectDate: (date: string) => void;
  className?: string;
};

/** Small month overview with a dot per entry (up to three). Used above the agenda on phones. */
export function CalendarCompactMonth({ date, today, entries, selectedDate, onSelectDate, className }: CalendarCompactMonthProps) {
  useTranslation("calendar");
  const locale = currentLocale();
  const days = datesInRange(monthGridRange(date));
  const month = date.slice(0, 7);
  const byDate = React.useMemo(() => groupEntriesByDate(entries, monthGridRange(date)), [entries, date]);

  return (
    <div className={cn("rounded-xl border bg-card p-2", className)}>
      <div className="grid grid-cols-7 text-center">
        {weekdayLabels(locale, "narrow").map((label, index) => (
          <span key={index} className="py-1 text-xs font-medium text-muted-foreground">
            {label}
          </span>
        ))}
        {days.map((day) => {
          const dayEntries = byDate.get(day) ?? [];
          const selected = day === selectedDate;
          return (
            <button
              key={day}
              type="button"
              aria-label={formatDayHeading(day, locale)}
              aria-pressed={selected}
              className="flex h-11 flex-col items-center justify-start gap-0.5 rounded-lg pt-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => onSelectDate(day)}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm tabular-nums",
                  day.slice(0, 7) !== month && "text-muted-foreground/60",
                  day === today && "font-semibold text-primary",
                  selected && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                {dayEntries.slice(0, 3).map((entry) => (
                  <span key={entry.key} className="size-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
