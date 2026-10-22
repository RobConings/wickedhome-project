import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarEntryDialog } from "@/features/calendar/components/calendar-entry-dialog";
import { calendarEventFixtures, calendarHabitants, calendarShops, entryFixture, overlayFixtures } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarEntryDialog",
  component: CalendarEntryDialog,
  args: {
    entry: entryFixture("event:e-dinner"),
    event: calendarEventFixtures.familyDinner,
    habitants: calendarHabitants,
    shops: calendarShops,
    canManage: true,
    onClose: () => {},
    onEdit: () => {},
  },
} satisfies Meta<typeof CalendarEntryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Event: Story = {};
export const StoreVisit: Story = { args: { entry: entryFixture("event:e-gamma"), event: calendarEventFixtures.gamma } };
export const Recurring: Story = {
  args: { entry: entryFixture("event:e-colruyt:2026-10-03"), event: calendarEventFixtures.groceries },
};
export const AsChild: Story = { args: { canManage: false } };
export const BirthdayOverlay: Story = { args: { entry: overlayFixtures.grandmaBirthday, event: null } };
export const BillOverlay: Story = { args: { entry: overlayFixtures.electricityBill, event: null } };
