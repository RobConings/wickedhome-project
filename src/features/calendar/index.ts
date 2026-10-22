// Public API of the calendar feature. Routes, the app frame and other features import from here only.
//
// For Shopping: store visits are calendar events with `kind: "store_visit"` and a shop.
// - List upcoming visits for a shop: `fetchStoreVisits({ shopId })` → `StoreVisit[]`; link with `calendarEventPath`.
// - Show a shop's list inside a visit: pass `renderShopList={(shopId) => <YourList shopId={shopId} />}` to
//   `CalendarScreen` / `CalendarEventScreen` in the route files (`src/routes/calendar*.tsx`).
// - Plan a visit from Shopping: render `CalendarEventFormDialog` with `defaults={{ kind: "store_visit", shopId }}`.
// Read-only overlays (tasks, bills, renewals…) are added server-side: see src/api/calendar/calendar-sources.ts.
export { CalendarEntryBadge } from "./components/calendar-entry-badge";
export { CalendarEntryIcon } from "./components/calendar-entry-icon";
export { CalendarEventFormDialog, type CalendarEventDefaults } from "./components/calendar-event-form-dialog";
export type { RenderShopList } from "./components/calendar-entry-details";
export {
  calendarAction,
  calendarEventAction,
  calendarEventLoader,
  calendarLoader,
  calendarShouldRevalidate,
  type CalendarEventScreenData,
  type CalendarScreenData,
} from "./data/calendar-loaders";
export { fetchAgenda, fetchCalendarEvent, fetchStoreVisits } from "./data/calendar-requests";
export { CalendarEventScreen } from "./screens/calendar-event-screen";
export { CalendarScreen } from "./screens/calendar-screen";
export {
  CALENDAR_CATEGORIES,
  CALENDAR_ENTRY_KINDS,
  calendarEventPath,
  canManageCalendar,
  type CalendarAgenda,
  type CalendarCategory,
  type CalendarEntry,
  type CalendarEntryKind,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarOverlayItem,
  type CalendarShopRef,
  type StoreVisit,
} from "./types/calendar";
