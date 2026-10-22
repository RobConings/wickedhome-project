import { CalendarDaysIcon, CalendarIcon, CalendarRangeIcon, ListIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { addDays, addMonthsClamped } from "@/types/dates";
import { CALENDAR_VIEWS, type CalendarView } from "../types/calendar";
import { endOfMonth, startOfMonth, weekRange, type DateRange } from "../types/calendar-time";
import { formatDayHeading, formatMonthTitle, formatRangeTitle } from "./calendar-format";

type CalendarToolbarProps = {
  view: CalendarView;
  date: string;
  today: string;
  /** Go to another view and/or anchor date. */
  onNavigate: (view: CalendarView, date: string) => void;
  /** The shown period is still loading: a spinner next to its title. */
  pending?: boolean;
  className?: string;
};

/** The period a view shows around `date`: one day, a week, or a month (month and agenda). */
function visiblePeriod(view: CalendarView, date: string): DateRange {
  if (view === "day") return { from: date, to: date };
  return view === "week" ? weekRange(date) : { from: startOfMonth(date), to: endOfMonth(date) };
}

/** Steps `date` one period back (-1) or forward (+1). */
function stepDate(view: CalendarView, date: string, step: -1 | 1): string {
  if (view === "day") return addDays(date, step);
  return view === "week" ? addDays(date, 7 * step) : addMonthsClamped(startOfMonth(date), step);
}

const VIEW_ICONS = { day: CalendarIcon, week: CalendarRangeIcon, month: CalendarDaysIcon, agenda: ListIcon } as const;

/**
 * Today, previous/next and the period title, plus the Day / Week / Month / Agenda switch, on every screen size.
 * Phones: the navigator on one row and the compact switcher (small, scrolls inside itself if it ever has to)
 * on the next, so nothing overflows.
 */
export function CalendarToolbar({ view, date, today, onNavigate, pending = false, className }: CalendarToolbarProps) {
  const { t } = useTranslation("calendar");
  const locale = currentLocale();
  const period = visiblePeriod(view, date);
  const label =
    view === "day" ? formatDayHeading(date, locale) : view === "week" ? formatRangeTitle(period, locale) : formatMonthTitle(date, locale);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3", className)}>
      <PeriodNavigator
        label={label}
        onPrevious={() => onNavigate(view, stepDate(view, date, -1))}
        onNext={() => onNavigate(view, stepDate(view, date, 1))}
        onToday={() => onNavigate(view, today)}
        isCurrent={today >= period.from && today <= period.to && (view !== "day" || date === today)}
        previousLabel={t("actions.previous")}
        nextLabel={t("actions.next")}
        todayLabel={t("actions.today")}
        pending={pending}
      />
      <SegmentedControl
        label={t("views.label")}
        size="sm"
        value={view}
        onChange={(next) => onNavigate(next, date)}
        options={CALENDAR_VIEWS.map((value) => ({ value, label: t(`views.${value}`), icon: VIEW_ICONS[value] }))}
        className="max-w-full"
      />
    </div>
  );
}
