import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarAgendaList } from "@/features/calendar/components/calendar-agenda-list";
import { NOW, TODAY, calendarHabitants, octoberAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarAgendaList",
  component: CalendarAgendaList,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div className="mx-auto max-w-2xl">{Story()}</div>],
  args: {
    entries: octoberAgenda.entries,
    range: { from: "2026-10-01", to: "2026-10-31" },
    today: TODAY,
    habitants: calendarHabitants,
    onSelectEntry: () => {},
  },
} satisfies Meta<typeof CalendarAgendaList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const OneWeek: Story = { args: { range: { from: "2026-10-05", to: "2026-10-11" } } };
export const Empty: Story = { args: { entries: [] } };
/** The week view on phones: every day (also empty ones), day headings open the day view, a "now" line today. */
export const WeekOnPhone: Story = {
  args: { range: { from: "2026-09-28", to: "2026-10-04" }, showEmptyDays: true, onSelectDay: () => {}, now: NOW },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const EmptyWeek: Story = {
  args: { entries: [], range: { from: "2026-09-28", to: "2026-10-04" }, showEmptyDays: true, onSelectDay: () => {}, now: NOW },
};
