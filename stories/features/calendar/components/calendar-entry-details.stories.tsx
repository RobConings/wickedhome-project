import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarEntryDetails } from "@/features/calendar/components/calendar-entry-details";
import { calendarEventFixtures, calendarHabitants, calendarShops, entryFixture, overlayFixtures } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarEntryDetails",
  component: CalendarEntryDetails,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: {
    entry: entryFixture("event:e-dinner"),
    event: calendarEventFixtures.familyDinner,
    habitants: calendarHabitants,
    shops: calendarShops,
  },
} satisfies Meta<typeof CalendarEntryDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FamilyDinner: Story = {};
export const RecurringSchoolRun: Story = {
  args: { entry: entryFixture("event:e-school:2026-10-02"), event: calendarEventFixtures.schoolRun },
};
/** Without Shopping, a placeholder explains where the shop's list will appear. */
export const StoreVisit: Story = { args: { entry: entryFixture("event:e-gamma"), event: calendarEventFixtures.gamma } };
/** How the Shopping feature will plug in, via `renderShopList`. */
export const StoreVisitWithShopList: Story = {
  args: {
    entry: entryFixture("event:e-gamma"),
    event: calendarEventFixtures.gamma,
    renderShopList: () => (
      <ul className="list-disc pl-5 text-sm">
        <li>Insulation boards (6×)</li>
        <li>Nail gun</li>
        <li>Wood glue</li>
      </ul>
    ),
  },
};
export const Birthday: Story = { args: { entry: overlayFixtures.grandmaBirthday, event: null } };
export const EventOnly: Story = { args: { entry: undefined, event: calendarEventFixtures.vet } };
