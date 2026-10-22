import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarDayGrid } from "@/features/calendar/components/calendar-week-grid";
import { NOW, TODAY, octoberAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarDayGrid",
  component: CalendarDayGrid,
  parameters: { layout: "padded" },
  args: {
    date: TODAY,
    today: TODAY,
    now: NOW,
    entries: octoberAgenda.entries,
    onSelectEntry: () => {},
    onAddAt: () => {},
  },
} satisfies Meta<typeof CalendarDayGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today: the cousins' stay and "Call the insurer" in the all-day row, the 21:00 reminder task at its hour, the "now" line. */
export const Today: Story = {};
/** The bins task at 20:00 the evening before the paper collection. */
export const BinsEvening: Story = { args: { date: "2026-10-06" } };
export const ReadOnly: Story = { args: { onAddAt: undefined } };
/** Phones: one column, the hours scroll inside the grid. */
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
