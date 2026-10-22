import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarWeekGrid } from "@/features/calendar/components/calendar-week-grid";
import { NOW, TODAY, octoberAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarWeekGrid",
  component: CalendarWeekGrid,
  parameters: { layout: "padded" },
  args: {
    date: TODAY,
    today: TODAY,
    now: NOW,
    entries: octoberAgenda.entries,
    onSelectEntry: () => {},
    onAddAt: () => {},
  },
} satisfies Meta<typeof CalendarWeekGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThisWeek: Story = {};
/** Store visit, vet and dentist week; the work trip to Lyon (timed, three days) runs as a bar. */
export const NextWeek: Story = { args: { date: "2026-10-07" } };
/** The autumn break and the Ardennes trip run as bars in two lanes. */
export const AutumnBreak: Story = { args: { date: "2026-10-28" } };
export const ReadOnly: Story = { args: { onAddAt: undefined } };
