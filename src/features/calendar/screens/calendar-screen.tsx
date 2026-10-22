import * as React from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useNavigation, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PendingContent } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { useOpenFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import { CalendarAgendaList } from "../components/calendar-agenda-list";
import { CalendarCategoryFilter } from "../components/calendar-category-filter";
import { CalendarCompactMonth } from "../components/calendar-compact-month";
import { CalendarEntryDialog } from "../components/calendar-entry-dialog";
import type { RenderShopList } from "../components/calendar-entry-details";
import { CalendarEventFormDialog, type CalendarEventDefaults } from "../components/calendar-event-form-dialog";
import { CalendarMonthGrid } from "../components/calendar-month-grid";
import { CalendarToolbar } from "../components/calendar-toolbar";
import { CalendarDayGrid, CalendarWeekGrid } from "../components/calendar-week-grid";
import { calendarSearch, parseCalendarSearch, type CalendarScreenData } from "../data/calendar-loaders";
import { preferredCalendarView, rememberCalendarView } from "../data/calendar-view-preference";
import {
  CATEGORY_FILTER_PARAM,
  SOURCE_FILTER_PARAM,
  matchesCalendarFilter,
  parseCategoryFilter,
  parseSourceFilter,
  type CalendarCategory,
  type CalendarEntry,
  type CalendarEvent,
} from "../types/calendar";
import { endOfMonth, startOfMonth, weekRange } from "../types/calendar-time";

type CalendarScreenProps = {
  data: CalendarScreenData;
  /** Adults and owners add and change events; children only look. */
  canManage: boolean;
  /** Shopping's list for a store visit's shop (see `RenderShopList`). */
  renderShopList?: RenderShopList;
  /** Fixed "now" for the week view's time line (stories). */
  now?: Date;
};

type FormState = { open: boolean; event?: CalendarEvent; defaults?: CalendarEventDefaults };

/**
 * The household calendar in four views, on every screen size: Day (hour grid), Week (hour grid; phones: the
 * seven days as one list), Month (grid; phones: compact month plus that month's agenda) and Agenda. The view is
 * in the URL and remembered per device (the default without a choice: Day on phones, Month elsewhere). The
 * legend filters what is shown by category and by source (kept in the URL,
 * `?categories=holiday,family&sources=waste,tasks`), in the browser, without reloading.
 */
export function CalendarScreen({ data, canManage, renderShopList, now }: CalendarScreenProps) {
  const { t } = useTranslation("calendar");
  const { t: tCommon } = useTranslation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  const { view, date, today, agenda, habitants, shops } = data;
  const [selectedEntry, setSelectedEntry] = React.useState<CalendarEntry | null>(null);
  const [form, setForm] = React.useState<FormState>({ open: false });
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const categories = parseCategoryFilter(searchParams.get(CATEGORY_FILTER_PARAM));
  const sources = parseSourceFilter(searchParams.get(SOURCE_FILTER_PARAM));
  const sourceChips = React.useMemo(
    () =>
      agenda.sources.map((source) => ({
        id: source.id,
        kind: source.kind ?? agenda.entries.find((entry) => entry.source === source.id)?.kind ?? "other",
        label: t(source.labelKey, { defaultValue: source.id }),
      })),
    [agenda.sources, agenda.entries, t],
  );

  const eventsById = new Map(agenda.events.map((event) => [event.id, event]));
  const selectedEvent = selectedEntry?.eventId ? (eventsById.get(selectedEntry.eventId) ?? null) : null;
  const month = { from: startOfMonth(date), to: endOfMonth(date) };
  const monthEntries =
    categories.length > 0 || sources.length > 0
      ? agenda.entries.filter((entry) => matchesCalendarFilter(entry, categories, sources))
      : agenda.entries;

  // Another period or view is loading: the toolbar already shows where we're going (so repeated clicks
  // keep stepping from there) and the calendar below fades with a spinner until the data is in.
  const pending = useSamePagePending();
  const goingTo =
    navigation.state === "loading" && navigation.location.pathname === location.pathname
      ? parseCalendarSearch(new URLSearchParams(navigation.location.search), today, preferredCalendarView())
      : null;
  const target = goingTo && (goingTo.view !== view || goingTo.date !== date) ? goingTo : null;

  const navigateTo = (nextView: typeof view, nextDate: string) => {
    setSelectedDate(null);
    // A different view is a choice this device remembers.
    if (nextView !== (target?.view ?? view)) rememberCalendarView(nextView);
    void navigate(calendarSearch(nextView, nextDate, categories, sources));
  };
  const setFilter = (nextCategories: CalendarCategory[], nextSources: string[]) =>
    void navigate(calendarSearch(view, date, nextCategories, nextSources), { replace: true, preventScrollReset: true });
  const defaultDay = view === "day" ? date : today >= month.from && today <= month.to ? today : month.from;

  // `?new=1` (the dashboard's quick action) opens a new event for today; the param is removed at once.
  // Derived rather than copied into `form` in an effect: the URL request shows the form until it closes.
  const [openFromUrl, setOpenFromUrl] = useOpenFromUrl(canManage);
  const urlDefaults = React.useMemo(() => ({ date: defaultDay }), [defaultDay]);
  const shownForm: FormState = openFromUrl && !form.open ? { open: true, defaults: urlDefaults } : form;
  const openForm = (next: FormState) => {
    setOpenFromUrl(false);
    setForm(next);
  };
  const addEvent = canManage ? (defaults: CalendarEventDefaults) => openForm({ open: true, defaults }) : undefined;
  const addAt = addEvent && ((day: string, time: string) => addEvent({ date: day, time }));

  return (
    <PageContainer className="gap-6">
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          canManage && (
            <Button onClick={() => addEvent?.({ date: selectedDate ?? defaultDay })}>
              <PlusIcon />
              {t("actions.add")}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <CalendarToolbar
          view={target?.view ?? view}
          date={target?.date ?? date}
          today={today}
          onNavigate={navigateTo}
          pending={target !== null}
        />
        <CalendarCategoryFilter selected={categories} onChange={setFilter} sources={sourceChips} selectedSources={sources} />
      </div>

      <PendingContent pending={pending} label={tCommon("loading.default")}>
        {view === "day" && (
          <CalendarDayGrid date={date} today={today} entries={monthEntries} now={now} onSelectEntry={setSelectedEntry} onAddAt={addAt} />
        )}

        {view === "week" && (
          <>
            {/* Phones: the seven days as one list (one column, nothing scrolls sideways); a day opens the day view. */}
            <CalendarAgendaList
              className="md:hidden"
              entries={monthEntries}
              range={weekRange(date)}
              today={today}
              habitants={habitants}
              now={now}
              showEmptyDays
              onSelectDay={(day) => navigateTo("day", day)}
              onSelectEntry={setSelectedEntry}
            />
            <CalendarWeekGrid
              className="hidden md:flex"
              date={date}
              today={today}
              entries={monthEntries}
              now={now}
              onSelectEntry={setSelectedEntry}
              onAddAt={addAt}
            />
          </>
        )}

        {view === "month" && (
          <>
            {/* Phones: compact month + the agenda for the month (tap a day to jump to it). */}
            <div className="flex flex-col gap-5 md:hidden">
              <CalendarCompactMonth
                date={date}
                today={today}
                entries={monthEntries}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
              <CalendarAgendaList
                entries={monthEntries}
                range={month}
                today={today}
                habitants={habitants}
                selectedDate={selectedDate}
                onSelectEntry={setSelectedEntry}
              />
            </div>
            <CalendarMonthGrid
              className="hidden md:block"
              date={date}
              today={today}
              entries={monthEntries}
              onSelectEntry={setSelectedEntry}
              onAddOnDay={addEvent && ((day) => addEvent({ date: day }))}
            />
          </>
        )}

        {view === "agenda" && (
          <CalendarAgendaList entries={monthEntries} range={month} today={today} habitants={habitants} onSelectEntry={setSelectedEntry} />
        )}
      </PendingContent>

      <CalendarEntryDialog
        entry={selectedEntry}
        event={selectedEvent}
        habitants={habitants}
        shops={shops}
        canManage={canManage}
        renderShopList={renderShopList}
        onClose={() => setSelectedEntry(null)}
        onEdit={(event) => {
          setSelectedEntry(null);
          openForm({ open: true, event });
        }}
      />

      {canManage && (
        <CalendarEventFormDialog
          open={shownForm.open}
          onOpenChange={(open) => {
            setOpenFromUrl(false);
            setForm({ ...shownForm, open });
          }}
          event={shownForm.event}
          defaults={shownForm.defaults}
          habitants={habitants}
          shops={shops}
          targets={data.agenda.targets}
        />
      )}
    </PageContainer>
  );
}
