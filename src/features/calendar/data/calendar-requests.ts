import { api } from "../lib/api-client";
import type {
  AgendaQuery,
  CalendarAgenda,
  CalendarEvent,
  CalendarEventInput,
  StoreVisit,
  StoreVisitQuery,
} from "../types/calendar";

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const fetchAgenda = (range: AgendaQuery) => api.get<CalendarAgenda>(`/calendar/agenda${query(range)}`);
export const fetchCalendarEvent = (id: string) => api.get<CalendarEvent>(`/calendar/events/${encodeURIComponent(id)}`);
/** `null` when the event went to another calendar (`input.target`, e.g. a Google calendar). */
export const createCalendarEvent = (input: CalendarEventInput) => api.post<CalendarEvent | null>("/calendar/events", input);
export const updateCalendarEvent = (id: string, input: CalendarEventInput) =>
  api.put<CalendarEvent>(`/calendar/events/${encodeURIComponent(id)}`, input);
export const deleteCalendarEvent = (id: string) => api.delete(`/calendar/events/${encodeURIComponent(id)}`);

/** Upcoming store visits (one per occurrence), optionally for one shop. Used by Shopping. */
export const fetchStoreVisits = (params: StoreVisitQuery = {}) =>
  api.get<StoreVisit[]>(`/calendar/store-visits${query(params)}`);
