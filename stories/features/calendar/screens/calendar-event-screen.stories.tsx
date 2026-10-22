import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarEventScreen } from "@/features/calendar/screens/calendar-event-screen";
import { calendarEventFixtures, calendarEventScreenFixture } from "../fixtures";

const meta = {
  title: "Features/Calendar/Screens/CalendarEventScreen",
  component: CalendarEventScreen,
  parameters: { layout: "fullscreen" },
  args: { data: calendarEventScreenFixture, canManage: true },
} satisfies Meta<typeof CalendarEventScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StoreVisit: Story = {};
export const RecurringEvent: Story = { args: { data: { ...calendarEventScreenFixture, event: calendarEventFixtures.schoolRun } } };
export const AsChild: Story = { args: { canManage: false } };
