import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import { fetchHouseholdOverview, type Habitant } from "@/features/household";
import { fetchShops, type Shop } from "@/features/shops";
import { formDataToObject, toFormResult, type FormResult } from "@/lib/forms";
import { NEW_FORM_PARAM } from "@/lib/open-from-url";
import { isoDateSchema } from "@/types/common";
import { todayIn } from "@/types/dates";
import {
  CATEGORY_FILTER_PARAM,
  HOUSEHOLD_TARGET,
  SOURCE_FILTER_PARAM,
  calendarEventInputSchema,
  calendarViewSchema,
  type CalendarAgenda,
  type CalendarCategory,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarView,
} from "../types/calendar";
import { monthGridRange } from "../types/calendar-time";
import { preferredCalendarView } from "./calendar-view-preference";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  fetchAgenda,
  fetchCalendarEvent,
  updateCalendarEvent,
} from "./calendar-requests";

export const CALENDAR_INTENTS = ["create", "update", "delete"] as const;
export type CalendarIntent = (typeof CALENDAR_INTENTS)[number];

export type CalendarActionResult = FormResult & { intent?: CalendarIntent; event?: CalendarEvent };

/** Everything the calendar screen shows. */
export type CalendarScreenData = {
  view: CalendarView;
  /** The anchor date the view is built around, `YYYY-MM-DD`. */
  date: string;
  today: string;
  agenda: CalendarAgenda;
  habitants: Habitant[];
  shops: Shop[];
};

/** `?view=day|week|month|agenda&date=YYYY-MM-DD`; without a view `fallbackView` (the device's choice), without a date today. */
export function parseCalendarSearch(
  search: URLSearchParams,
  today: string,
  fallbackView: CalendarView = "month",
): { view: CalendarView; date: string } {
  const view = calendarViewSchema.safeParse(search.get("view"));
  const date = isoDateSchema.safeParse(search.get("date"));
  return { view: view.success ? view.data : fallbackView, date: date.success ? date.data : today };
}

/** Search string for a view and date, e.g. `?view=week&date=2026-10-05`, plus the legend filter (categories, sources) if any. */
export function calendarSearch(
  view: CalendarView,
  date: string,
  categories: readonly CalendarCategory[] = [],
  sources: readonly string[] = [],
): string {
  const search = new URLSearchParams({ view, date });
  if (categories.length > 0) search.set(CATEGORY_FILTER_PARAM, categories.join(","));
  if (sources.length > 0) search.set(SOURCE_FILTER_PARAM, sources.join(","));
  return `?${search.toString()}`;
}

/**
 * Changing only the legend filter (categories, sources) needs no new data: the screen filters what it already has. Neither
 * does removing `?new=1` after the new-event form opened.
 */
export function calendarShouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  const withoutFilter = (url: URL) => {
    const search = new URLSearchParams(url.search);
    search.delete(CATEGORY_FILTER_PARAM);
    search.delete(SOURCE_FILTER_PARAM);
    search.delete(NEW_FORM_PARAM);
    search.sort();
    return search.toString();
  };
  return withoutFilter(currentUrl) === withoutFilter(nextUrl) ? false : defaultShouldRevalidate;
}

export async function calendarLoader({ request }: LoaderFunctionArgs): Promise<CalendarScreenData> {
  const today = todayIn();
  const { view, date } = parseCalendarSearch(new URL(request.url).searchParams, today, preferredCalendarView());
  // Always the whole month grid: it contains the day and the week of `date` too.
  const [agenda, overview, shops] = await Promise.all([
    fetchAgenda(monthGridRange(date)),
    fetchHouseholdOverview(),
    fetchShops(),
  ]);
  return { view, date, today, agenda, habitants: overview.habitants, shops };
}

export type CalendarEventScreenData = {
  event: CalendarEvent;
  today: string;
  habitants: Habitant[];
  shops: Shop[];
};

export async function calendarEventLoader({ params }: LoaderFunctionArgs): Promise<CalendarEventScreenData> {
  const [event, overview, shops] = await Promise.all([
    fetchCalendarEvent(params.eventId ?? ""),
    fetchHouseholdOverview(),
    fetchShops(),
  ]);
  return { event, today: todayIn(), habitants: overview.habitants, shops };
}

/** Parses the event form. Checkboxes and the participant list need more than `parseForm`. */
export function parseEventForm(
  formData: FormData,
): { data: CalendarEventInput; errors?: undefined } | { data?: undefined; errors: Record<string, string[]> } {
  const result = calendarEventInputSchema.safeParse({
    ...formDataToObject(formData),
    category: formData.get("category") === "none" ? undefined : formData.get("category") || undefined,
    target: formData.get("target") === HOUSEHOLD_TARGET ? undefined : formData.get("target") || undefined,
    allDay: formData.get("allDay") === "on",
    participantIds: formData.getAll("participantIds").map(String).filter(Boolean),
  });
  if (result.success) return { data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { errors };
}

async function handleEventForm(formData: FormData): Promise<CalendarActionResult> {
  const intent = formData.get("intent") as CalendarIntent | null;
  const id = String(formData.get("id") ?? "");

  try {
    if (intent === "delete") {
      await deleteCalendarEvent(id);
      return { ok: true, intent };
    }
    const { data, errors } = parseEventForm(formData);
    if (errors) return { errors, intent: intent ?? undefined };

    const event = intent === "update" ? await updateCalendarEvent(id, data) : await createCalendarEvent(data);
    // `null`: created in another calendar (a Google calendar), not as a household event.
    return { ok: true, intent: intent ?? "create", event: event ?? undefined };
  } catch (error) {
    return {
      ...toFormResult(error, { not_found: i18n.t("calendar:errors.notFound") }),
      intent: intent ?? undefined,
    };
  }
}

/** One action for the calendar page; the form's `intent` field says what to do. */
export async function calendarAction({ request }: ActionFunctionArgs): Promise<CalendarActionResult> {
  return handleEventForm(await request.formData());
}

/** Action of the event page: like the calendar's, but a delete goes back to the calendar. */
export async function calendarEventAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await handleEventForm(formData);
  if (result.ok && result.intent === "delete") {
    const date = formData.get("date");
    // Back to that day in the view this device uses.
    return redirect(`/calendar${typeof date === "string" && isoDateSchema.safeParse(date).success ? `?date=${date}` : ""}`);
  }
  return result;
}
