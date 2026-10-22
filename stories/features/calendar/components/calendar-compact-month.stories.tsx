import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarCompactMonth } from "@/features/calendar/components/calendar-compact-month";
import { TODAY, octoberAgenda } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarCompactMonth",
  component: CalendarCompactMonth,
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: { date: TODAY, today: TODAY, entries: octoberAgenda.entries, onSelectDate: () => {} },
  render: (args) => {
    const [selected, setSelected] = React.useState(args.selectedDate ?? null);
    return <CalendarCompactMonth {...args} selectedDate={selected} onSelectDate={setSelected} />;
  },
} satisfies Meta<typeof CalendarCompactMonth>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const DaySelected: Story = { args: { selectedDate: "2026-10-10" } };
