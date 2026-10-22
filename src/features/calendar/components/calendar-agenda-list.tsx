import * as React from "react";
import { BellIcon, CalendarDaysIcon, ChevronRightIcon, MapPinIcon, RepeatIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/shared/empty-state";
import { HabitantAvatar, type Habitant } from "@/features/household";
import { ShopLogo } from "@/features/shops";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { addDays } from "@/types/dates";
import type { CalendarEntry } from "../types/calendar";
import { datesInRange, type DateRange } from "../types/calendar-time";
import { CalendarEntryGlyph } from "./calendar-category-icon";
import {
  entryTitle,
  formatDayHeading,
  formatEntryDateRange,
  formatEntryTime,
  groupEntriesForAgenda,
  isMultiDay,
} from "./calendar-format";

type CalendarAgendaListProps = {
  entries: CalendarEntry[];
  /** Days to list; days without entries are skipped (unless `showEmptyDays`). */
  range: DateRange;
  /** List every day of the range, also the empty ones ("Nothing planned"): the week view on phones. */
  showEmptyDays?: boolean;
  /** Makes each day heading a button, e.g. to open that day in the day view. */
  onSelectDay?: (date: string) => void;
  /** Draws a "now" line between today's entries (defaults to the real clock; fixed in stories). */
  now?: Date;
  today: string;
  habitants: Habitant[];
  onSelectEntry: (entry: CalendarEntry) => void;
  /** Highlighted day (e.g. picked in the compact month); its heading is scrolled into view. */
  selectedDate?: string | null;
  className?: string;
};

/**
 * Upcoming entries grouped per day: the calendar's agenda view (and under the compact month on phones). A
 * multi-day entry (a trip) is listed once, on its first day, with its date range. With `showEmptyDays` it lists
 * every day of a week, with a "now" line today: the week view on phones (one column, no sideways scrolling).
 */
export function CalendarAgendaList({
  entries,
  range,
  today,
  habitants,
  onSelectEntry,
  selectedDate,
  showEmptyDays = false,
  onSelectDay,
  now,
  className,
}: CalendarAgendaListProps) {
  const { t } = useTranslation("calendar");
  const locale = currentLocale();
  const byDate = React.useMemo(() => groupEntriesForAgenda(entries, range), [entries, range]);
  const days = showEmptyDays ? datesInRange(range) : [...byDate.keys()].sort();
  const [clock] = React.useState(() => Date.now());
  const nowMs = now?.getTime() ?? clock;
  const habitantsById = new Map(habitants.map((habitant) => [habitant.id, habitant]));
  const list = React.useRef<HTMLOListElement>(null);

  React.useEffect(() => {
    if (!selectedDate) return;
    list.current?.querySelector(`[data-date="${selectedDate}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDate]);

  if (days.length === 0) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title={t("empty.title")}
        description={t("empty.description")}
        className={className}
      />
    );
  }

  const relative = (day: string) =>
    day === today ? t("agenda.today") : day === addDays(today, 1) ? t("agenda.tomorrow") : null;
  const heading = (day: string) => (
    <>
      {relative(day) && <span className="text-primary">{relative(day)}</span>}
      <span className={cn(relative(day) && "font-normal text-muted-foreground")}>{formatDayHeading(day, locale)}</span>
    </>
  );
  /** Today: where the "now" line goes, before the first timed entry that is still to come. */
  const nowIndex = (items: CalendarEntry[]) => {
    const index = items.findIndex((entry) => !entry.allDay && !isMultiDay(entry) && Date.parse(entry.start) > nowMs);
    return index === -1 ? items.length : index;
  };

  const entryRow = (entry: CalendarEntry, day: string) => {
    const people = entry.participantIds.flatMap((id) => habitantsById.get(id) ?? []);
    return (
      <li key={entry.key}>
        <button
          type="button"
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50"
          onClick={() => onSelectEntry(entry)}
        >
          <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums sm:w-28">
            {isMultiDay(entry) ? formatEntryDateRange(entry, locale) : (formatEntryTime(entry, day, locale, t) ?? t("entry.allDay"))}
          </span>
          <span className="mt-1 h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarEntryGlyph entry={entry} className="text-muted-foreground" />
              <span className="truncate">{entryTitle(entry, t)}</span>
              {entry.recurring && <RepeatIcon className="size-3 shrink-0 text-muted-foreground" aria-label={t("entry.recurring")} />}
              {entry.meta?.reminder ? <BellIcon className="size-3 shrink-0 text-muted-foreground" aria-label={t("entry.reminder")} /> : null}
            </span>
            {(entry.location || entry.shop) && (
              <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                {entry.shop ? (
                  <ShopLogo shop={entry.shop} size="sm" className="size-3.5 rounded-[3px]" />
                ) : (
                  <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{entry.shop?.name ?? entry.location}</span>
              </span>
            )}
          </span>
          {people.length > 0 && entry.kind !== "birthday" && (
            <span className="flex shrink-0 -space-x-1.5">
              {people.slice(0, 3).map((habitant) => (
                <HabitantAvatar key={habitant.id} habitant={habitant} size="sm" />
              ))}
            </span>
          )}
        </button>
      </li>
    );
  };

  /** A day's rows; in the week list, today's get the "now" line in between. */
  const dayRows = (day: string, items: CalendarEntry[]) => {
    const rows = items.map((entry) => entryRow(entry, day));
    if (day !== today || !showEmptyDays) return rows;
    const line = (
      <li key="now" aria-hidden="true" className="relative h-0.5 bg-destructive">
        <span className="absolute -top-1 left-0 size-2.5 rounded-full bg-destructive" />
      </li>
    );
    const at = nowIndex(items);
    return [...rows.slice(0, at), line, ...rows.slice(at)];
  };

  return (
    <ol ref={list} className={cn("flex flex-col gap-5", className)}>
      {days.map((day) => {
        const dayEntries = byDate.get(day) ?? [];
        return (
          <li key={day} data-date={day} className="flex scroll-mt-4 flex-col gap-2">
            <h3
              className={cn(
                "flex items-baseline gap-2 text-sm font-semibold first-letter:uppercase",
                day === selectedDate && "text-primary",
              )}
            >
              {onSelectDay ? (
                <button
                  type="button"
                  className="-mx-1 flex min-w-0 items-baseline gap-2 rounded-md px-1 text-left outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => onSelectDay(day)}
                  aria-label={t("agenda.openDay", { date: formatDayHeading(day, locale) })}
                >
                  {heading(day)}
                  <ChevronRightIcon className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden="true" />
                </button>
              ) : (
                heading(day)
              )}
            </h3>
            {dayEntries.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">{t("agenda.nothing")}</p>
            ) : (
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">{dayRows(day, dayEntries)}</ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
