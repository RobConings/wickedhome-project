import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarMonthGrid } from "@/features/calendar/components/calendar-month-grid";
import { EASTER_DATE, TODAY, easterAgenda, octoberAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarMonthGrid",
  component: CalendarMonthGrid,
  parameters: { layout: "padded" },
  args: {
    date: TODAY,
    today: TODAY,
    entries: octoberAgenda.entries,
    onSelectEntry: () => {},
    onAddOnDay: () => {},
  },
} satisfies Meta<typeof CalendarMonthGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Ardennes trip wraps from one week row to the next and shares a week with the autumn break (two lanes). */
export const Default: Story = {};
export const EasterHoliday: Story = { args: { date: EASTER_DATE, entries: easterAgenda.entries } };
export const ReadOnly: Story = { args: { onAddOnDay: undefined } };
export const TwoPerDay: Story = { args: { maxPerDay: 2 } };
export const Empty: Story = { args: { entries: [] } };
