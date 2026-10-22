import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarScreen } from "@/features/calendar/screens/calendar-screen";
import { EASTER_DATE, NOW, calendarScreenFixture, easterAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Screens/CalendarScreen",
  component: CalendarScreen,
  parameters: { layout: "fullscreen" },
  args: { data: calendarScreenFixture, canManage: true, now: NOW },
} satisfies Meta<typeof CalendarScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
/** Day: all-day row (cousins, "Call the insurer") and the hour grid with the 21:00 reminder task and the "now" line. */
export const Day: Story = { args: { data: { ...calendarScreenFixture, view: "day" } } };
export const Week: Story = { args: { data: { ...calendarScreenFixture, view: "week" } } };
export const Agenda: Story = { args: { data: { ...calendarScreenFixture, view: "agenda" } } };
export const AsChild: Story = { args: { canManage: false } };
/** From the dashboard's quick action (`?new=1`): the new-event form opens for today; the param is removed. */
export const NewFromDashboard: Story = { parameters: { router: { initialEntries: ["/calendar?new=1"] } } };
/** The legend filters by category; the choice is kept in the URL. */
export const FilteredToHolidaysAndFamily: Story = {
  parameters: { router: { initialEntries: ["/calendar?view=month&date=2026-10-02&categories=family,holiday"] } },
};
export const EasterHoliday: Story = { args: { data: { ...calendarScreenFixture, date: EASTER_DATE, agenda: easterAgenda } } };
/** Phones, month: the compact month with the month's agenda below it. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
/** Phones, day (the default on a phone without a remembered choice): one column, the hour grid scrolls inside. */
export const MobileDay: Story = {
  args: { data: { ...calendarScreenFixture, view: "day" } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
/** Phones, week: the seven days as one list; a day heading opens it in the day view. */
export const MobileWeek: Story = {
  args: { data: { ...calendarScreenFixture, view: "week" } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const MobileAgenda: Story = {
  args: { data: { ...calendarScreenFixture, view: "agenda" } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const Empty: Story = {
  args: { data: { ...calendarScreenFixture, agenda: { ...calendarScreenFixture.agenda, entries: [], events: [] } } },
};
