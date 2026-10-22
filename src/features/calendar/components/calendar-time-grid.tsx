import * as React from "react";
import { BellIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatWeekday } from "@/types/date-format";
import type { CalendarEntry } from "../types/calendar";
import { zonedParts } from "../types/calendar-time";
import { CalendarEntryGlyph } from "./calendar-category-icon";
import { entryTitle, formatEntryTime, groupEntriesByDate, isMultiDay } from "./calendar-format";
import { CalendarEntryBadge } from "./calendar-entry-badge";
import { SPAN_LANE_HEIGHT, layoutDay, layoutSpans, spanBarStyle } from "./calendar-layout";

export type CalendarTimeGridProps = {
  /** Consecutive days, one column each (a week, or one day). */
  days: string[];
  today: string;
  entries: CalendarEntry[];
  onSelectEntry: (entry: CalendarEntry) => void;
  /** Called with the day and the clicked hour (`HH:00`); omit when the user can't add events. */
  onAddAt?: (date: string, time: string) => void;
  /** Hour the grid scrolls to initially. Default: just before now when today is shown, else 07:00. */
  scrollToHour?: number;
  /** Current time, for the "now" line (defaults to the real clock, refreshed every minute; fixed in stories). */
  now?: Date;
  className?: string;
};

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const LABEL_COLUMN = "3.5rem";
const pad = (value: number) => String(value).padStart(2, "0");

/** Minutes since midnight in the household time zone, kept current (a minute timer) unless `now` is fixed. */
function useNowMinute(now: Date | undefined): number {
  const [live, setLive] = React.useState(() => zonedParts(new Date()).minutes);
  React.useEffect(() => {
    if (now) return;
    const timer = window.setInterval(() => setLive(zonedParts(new Date()).minutes), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);
  return now ? zonedParts(now).minutes : live;
}

/**
 * Time grid for one or more days: day headers, an all-day row (birthdays, waste, bills, all-day tasks; multi-day
 * entries as bars in lanes) and 24 hours with the timed entries (events, timed tasks) side by side where they
 * overlap, plus a "now" line on today. The week and day views are built on it.
 */
export function CalendarTimeGrid({ days, today, entries, onSelectEntry, onAddAt, scrollToHour, now, className }: CalendarTimeGridProps) {
  const { t } = useTranslation("calendar");
  const locale = currentLocale();
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  const columns = Math.max(1, days.length);
  const single = columns === 1;
  const byDate = React.useMemo(() => groupEntriesByDate(entries, { from: first, to: last }), [entries, first, last]);
  const scroller = React.useRef<HTMLDivElement>(null);
  const nowMinute = useNowMinute(now);
  const showsToday = days.includes(today);
  const initialHour = scrollToHour ?? (showsToday ? Math.max(0, Math.floor(nowMinute / 60) - 1) : 7);
  const template = { gridTemplateColumns: `${LABEL_COLUMN} repeat(${columns}, minmax(0, 1fr))` };

  // Scroll to the starting hour when the shown days change, not on every minute tick.
  const daysKey = days.join(",");
  React.useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = initialHour * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another period is shown
  }, [daysKey]);

  const { segments, lanes } = React.useMemo(() => layoutSpans(entries, days), [entries, days]);
  const singleAllDay = (day: string) => (byDate.get(day) ?? []).filter((entry) => entry.allDay && !isMultiDay(entry));
  const hasAllDay = lanes > 0 || days.some((day) => singleAllDay(day).length > 0);

  function handleColumnClick(day: string, event: React.MouseEvent<HTMLDivElement>) {
    if (!onAddAt || event.target !== event.currentTarget) return;
    const offset = event.nativeEvent.offsetY;
    onAddAt(day, `${pad(Math.min(23, Math.max(0, Math.floor(offset / HOUR_HEIGHT))))}:00`);
  }

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", className)}>
      {/* Day headers */}
      <div className="grid border-b bg-muted/40" style={template}>
        <div />
        {days.map((day) => (
          <div key={day} className={cn("flex items-center justify-center gap-0.5 border-l py-2", single ? "gap-2" : "flex-col")}>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {formatWeekday(day, locale, single ? "long" : "short")}
            </span>
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums",
                day === today && "bg-primary text-primary-foreground",
              )}
            >
              {Number(day.slice(8))}
            </span>
          </div>
        ))}
      </div>

      {/* All-day row */}
      {hasAllDay && (
        <div className="relative grid border-b" style={template}>
          <div className="px-1 py-1.5 text-right text-[0.65rem] leading-6 text-muted-foreground">{t("entry.allDay")}</div>
          {days.map((day) => (
            <div key={day} className="flex min-w-0 flex-col gap-1 border-l p-1">
              {lanes > 0 && <div aria-hidden="true" className="shrink-0" style={{ height: lanes * SPAN_LANE_HEIGHT - 4 }} />}
              {singleAllDay(day).map((entry) => (
                <CalendarEntryBadge key={entry.key} entry={entry} onClick={() => onSelectEntry(entry)} />
              ))}
            </div>
          ))}
          {segments.length > 0 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 left-14">
              {segments.map((segment) => (
                <CalendarEntryBadge
                  key={segment.entry.key}
                  entry={segment.entry}
                  bar
                  continuesBefore={segment.continuesBefore}
                  continuesAfter={segment.continuesAfter}
                  className="pointer-events-auto absolute z-10"
                  style={spanBarStyle(segment, { top: 4, columns })}
                  onClick={() => onSelectEntry(segment.entry)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time grid */}
      <div ref={scroller} className="max-h-[70vh] overflow-y-auto">
        <div className="relative grid" style={{ ...template, height: 24 * HOUR_HEIGHT }}>
          <div className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[0.65rem] text-muted-foreground tabular-nums"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {pad(hour)}:00
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={cn("relative border-l", onAddAt && "cursor-pointer")}
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px)`,
              }}
              onClick={(event) => handleColumnClick(day, event)}
            >
              {layoutDay((byDate.get(day) ?? []).filter((entry) => !isMultiDay(entry)), day).map(({ entry, startMinute, endMinute, column, columns: across }) => (
                <button
                  key={entry.key}
                  type="button"
                  className="absolute flex min-h-5 flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:brightness-125"
                  style={{
                    top: (startMinute / 60) * HOUR_HEIGHT,
                    height: Math.max(((endMinute - startMinute) / 60) * HOUR_HEIGHT - 2, 18),
                    left: `calc(${(column / across) * 100}% + 2px)`,
                    width: `calc(${100 / across}% - 4px)`,
                    borderLeftColor: entry.color,
                    backgroundColor: `color-mix(in oklab, ${entry.color} 18%, var(--card))`,
                  }}
                  onClick={() => onSelectEntry(entry)}
                >
                  <span className="flex min-w-0 items-center gap-1 font-medium">
                    <CalendarEntryGlyph entry={entry} className="size-3" />
                    <span className="truncate">{entryTitle(entry, t)}</span>
                    {entry.meta?.reminder ? <BellIcon className="size-3 shrink-0 opacity-70" aria-label={t("entry.reminder")} /> : null}
                  </span>
                  <span className="truncate text-muted-foreground tabular-nums">{formatEntryTime(entry, day, locale, t)}</span>
                </button>
              ))}
              {day === today && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive"
                  style={{ top: (nowMinute / 60) * HOUR_HEIGHT }}
                  aria-hidden="true"
                >
                  <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-destructive" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
