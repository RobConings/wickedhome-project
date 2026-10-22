import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarEntryBadge } from "@/features/calendar/components/calendar-entry-badge";
import { entryFixture, overlayFixtures } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarEntryBadge",
  component: CalendarEntryBadge,
  decorators: [(Story) => <div className="w-56">{Story()}</div>],
  args: { entry: entryFixture("event:e-dinner"), time: "18:00", onClick: () => {} },
} satisfies Meta<typeof CalendarEntryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Timed: Story = {};
export const Recurring: Story = { args: { entry: entryFixture("event:e-school:2026-10-02"), time: "08:15" } };
export const StoreVisit: Story = { args: { entry: entryFixture("event:e-gamma"), time: "10:00" } };
export const AllDay: Story = { args: { entry: entryFixture("event:e-break"), time: null } };
/** A multi-day bar that goes on in the next week row. */
export const BarContinuing: Story = { args: { entry: entryFixture("event:e-ardennes"), time: null, bar: true, continuesAfter: true } };
export const Birthday: Story = { args: { entry: overlayFixtures.grandmaBirthday, time: null } };
export const BillOverlay: Story = { args: { entry: overlayFixtures.electricityBill, time: null } };
export const NotClickable: Story = { args: { onClick: undefined } };
