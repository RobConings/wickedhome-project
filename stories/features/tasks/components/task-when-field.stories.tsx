import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskWhenField } from "@/features/tasks/components/task-when-field";
import { EMPTY_WHEN, type TaskWhenValue } from "@/features/tasks/types/task-when";
import { tasksToday } from "../fixtures";

/** Controlled like in the task form: the story keeps the value. */
function Controlled({ initial, errors }: { initial: TaskWhenValue; errors?: Record<string, string[]> }) {
  const [value, setValue] = React.useState(initial);
  return <TaskWhenField id="when" value={value} onChange={setValue} today={tasksToday} errorsFor={(name) => errors?.[name]} />;
}

const meta = {
  title: "Features/Tasks/Components/TaskWhenField",
  component: Controlled,
  parameters: { layout: "padded" },
  args: { initial: EMPTY_WHEN },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No date ("whenever"): only the choices. Tapping one fills in today. */
export const NoDate: Story = {};
/** All day on one day. */
export const Day: Story = { args: { initial: { ...EMPTY_WHEN, kind: "day", date: "2026-10-04" } } };
/** A moment: Sunday at 18:00. */
export const Moment: Story = { args: { initial: { ...EMPTY_WHEN, kind: "moment", date: "2026-10-04", time: "18:00" } } };
/** A timeslot: Saturday 10:00–12:00 (a new start time moves a missing or earlier end to an hour later). */
export const Timeslot: Story = { args: { initial: { ...EMPTY_WHEN, kind: "slot", date: "2026-10-03", time: "10:00", endTime: "12:00" } } };
/** Several days, all day: 12/10 → 14/10. */
export const SeveralDays: Story = { args: { initial: { ...EMPTY_WHEN, kind: "days", startDate: "2026-10-12", date: "2026-10-14" } } };
/** The API refused the end time. */
export const WithError: Story = {
  args: {
    initial: { ...EMPTY_WHEN, kind: "slot", date: "2026-10-03", time: "12:00", endTime: "10:00" },
    errors: { endTime: ["The end has to be after the start."] },
  },
};
/** On a phone: the choices wrap, the inputs stack in one column. */
export const Mobile: Story = { ...Timeslot, globals: { viewport: { value: "mobile1" } } };
export const SeveralDaysMobile: Story = { ...SeveralDays, globals: { viewport: { value: "mobile1" } } };
