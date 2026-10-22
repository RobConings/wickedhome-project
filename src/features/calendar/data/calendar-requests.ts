import { api, restResource, withQuery } from "@/lib/api-client";
import type {
  AgendaQuery,
  CalendarAgenda,
  CalendarEvent,
  CalendarEventInput,
  StoreVisit,
  StoreVisitQuery,
} from "../types/calendar";

const events = restResource<CalendarEvent, CalendarEventInput, CalendarEvent, CalendarEvent | null>("/calendar/events");

export const fetchAgenda = (range: AgendaQuery) => api.get<CalendarAgenda>(withQuery("/calendar/agenda", range));
export const fetchCalendarEvent = events.get;
/** `null` when the event went to another calendar (`input.target`, e.g. a Google calendar). */
export const createCalendarEvent = events.create;
export const updateCalendarEvent = events.update;
export const deleteCalendarEvent = events.remove;

/** Upcoming store visits (one per occurrence), optionally for one shop. Used by Shopping. */
export const fetchStoreVisits = (params: StoreVisitQuery = {}) =>
  api.get<StoreVisit[]>(withQuery("/calendar/store-visits", params));
