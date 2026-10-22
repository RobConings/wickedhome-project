import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendarToolbar } from "@/features/calendar/components/calendar-toolbar";
import type { CalendarView } from "@/features/calendar/types/calendar";
import { TODAY } from "../fixtures";

const meta = {
  title: "Features/Calendar/Components/CalendarToolbar",
  component: CalendarToolbar,
  parameters: { layout: "padded" },
  args: { view: "month", date: TODAY, today: TODAY, onNavigate: () => {} },
  render: (args) => {
    const [state, setState] = React.useState<{ view: CalendarView; date: string }>({ view: args.view, date: args.date });
    return <CalendarToolbar {...args} {...state} onNavigate={(view, date) => setState({ view, date })} />;
  },
} satisfies Meta<typeof CalendarToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const Week: Story = { args: { view: "week" } };
export const Day: Story = { args: { view: "day" } };
export const Agenda: Story = { args: { view: "agenda" } };
/** Phones: the navigator on one row, the compact Day / Week / Month / Agenda switch below it; nothing overflows. */
export const Mobile: Story = { args: { view: "day" }, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const OtherMonth: Story = { args: { date: "2026-12-01" } };
/** The chosen period is still loading. */
export const Pending: Story = { args: { pending: true } };
