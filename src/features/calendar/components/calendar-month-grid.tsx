import * as React from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CalendarEntry } from "../types/calendar";
import { datesInRange, monthGridRange } from "../types/calendar-time";
import { formatDayHeading, groupEntriesByDate, isMultiDay, startTimeOn, weekdayLabels } from "./calendar-format";
import { CalendarEntryBadge } from "./calendar-entry-badge";
import { SPAN_LANE_HEIGHT, layoutSpans, spanBarStyle } from "./calendar-layout";

type CalendarMonthGridProps = {
  /** Any date in the month to show. */
  date: string;
  today: string;
  entries: CalendarEntry[];
  onSelectEntry: (entry: CalendarEntry) => void;
  /** Called when a day is clicked; omit when the user can't add events. */
  onAddOnDay?: (date: string) => void;
  /** Rows (bars and entries) shown per day before "+n more". */
  maxPerDay?: number;
  className?: string;
};

/** Top of the first bar lane in a day cell: padding (6px) + day number (24px) + gap (4px). */
const FIRST_LANE_TOP = 34;

/**
 * Monday-first month grid. Multi-day entries (trips, holidays) run as one bar across the days they cover,
 * wrapping at week boundaries and stacked in lanes when they overlap; other entries sit in their day.
 * Click a day to add an event, an entry to open it.
 */
export function CalendarMonthGrid({
  date,
  today,
  entries,
  onSelectEntry,
  onAddOnDay,
  maxPerDay = 3,
  className,
}: CalendarMonthGridProps) {
  const { t } = useTranslation("calendar");
  const locale = currentLocale();
  const range = monthGridRange(date);
  const days = datesInRange(range);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const month = date.slice(0, 7);
  const byDate = React.useMemo(() => groupEntriesByDate(entries, monthGridRange(date)), [entries, date]);

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {weekdayLabels(locale, "short").map((label) => (
          <div key={label} className="px-2 py-2 text-xs font-medium text-muted-foreground uppercase">
            {label}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const { segments, lanes } = layoutSpans(entries, week);
        const shownLanes = Math.min(lanes, maxPerDay);
        return (
          <div key={week[0]} className="relative grid grid-cols-7 [&>*:nth-child(7)]:border-r-0">
            {week.map((day, column) => {
              const dayEntries = byDate.get(day) ?? [];
              const singles = dayEntries.filter((entry) => !isMultiDay(entry));
              const hiddenBars = segments.filter(
                (segment) => segment.lane >= shownLanes && segment.startColumn <= column && segment.endColumn >= column,
              ).length;
              const room = Math.max(0, maxPerDay - shownLanes);
              const overflowing = singles.length + hiddenBars > room;
              const visible = overflowing ? singles.slice(0, Math.max(0, room - 1)) : singles;
              const hidden = singles.length - visible.length + hiddenBars;
              const isToday = day === today;
              const inMonth = day.slice(0, 7) === month;
              return (
                <div
                  key={day}
                  className={cn(
                    "group relative flex min-h-28 min-w-0 flex-col gap-1 border-r border-b p-1.5",
                    !inMonth && "bg-muted/30",
                    onAddOnDay && "cursor-pointer hover:bg-accent/40",
                  )}
                  onClick={onAddOnDay ? () => onAddOnDay(day) : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums",
                        !inMonth && "text-muted-foreground",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {onAddOnDay && (
                      <button
                        type="button"
                        className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                        aria-label={t("entry.dayLabel", { date: formatDayHeading(day, locale) })}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddOnDay(day);
                        }}
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Room for the bars, which are drawn over the whole week row. */}
                  {shownLanes > 0 && <div aria-hidden="true" className="shrink-0" style={{ height: shownLanes * SPAN_LANE_HEIGHT - 4 }} />}
                  {visible.map((entry) => (
                    <CalendarEntryBadge
                      key={entry.key}
                      entry={entry}
                      time={startTimeOn(entry, day)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectEntry(entry);
                      }}
                    />
                  ))}
                  {hidden > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="self-start rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {t("entry.more", { count: hidden })}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="flex w-64 flex-col gap-1 p-2" onClick={(event) => event.stopPropagation()}>
                        <p className="px-1.5 pb-1 text-sm font-semibold first-letter:uppercase">
                          {formatDayHeading(day, locale)}
                        </p>
                        {dayEntries.map((entry) => (
                          <CalendarEntryBadge
                            key={entry.key}
                            entry={entry}
                            bar={isMultiDay(entry)}
                            time={startTimeOn(entry, day)}
                            onClick={() => onSelectEntry(entry)}
                          />
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              );
            })}
            {segments
              .filter((segment) => segment.lane < shownLanes)
              .map((segment) => (
                <CalendarEntryBadge
                  key={segment.entry.key}
                  entry={segment.entry}
                  bar
                  continuesBefore={segment.continuesBefore}
                  continuesAfter={segment.continuesAfter}
                  className="absolute z-10"
                  style={spanBarStyle(segment, { top: FIRST_LANE_TOP })}
                  onClick={() => onSelectEntry(segment.entry)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
