import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskRepeatField } from "@/features/tasks/components/task-repeat-field";
import { tasksToday } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskRepeatField",
  component: TaskRepeatField,
  parameters: { layout: "padded" },
  args: { name: "rrule", startDate: tasksToday },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof TaskRepeatField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Off: one switch right under the "When". */
export const Off: Story = {};
/** On: the presets, "Every Friday" for a Friday due date, with an optional end date. */
export const Weekly: Story = { args: { defaultOn: true } };
export const EveryTwoWeeksUntil: Story = { args: { defaultValue: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;UNTIL=20261231" } };
export const Monthly: Story = { args: { defaultValue: "FREQ=MONTHLY" } };
/** Anything the presets can't say opens under "Custom" (the shared repeat fields). */
export const Custom: Story = { args: { defaultValue: "FREQ=WEEKLY;BYDAY=MO,TH;COUNT=10" } };
/** Weekly with weekday chips: "every Sunday" picked on a Friday; the first time is that Sunday. */
export const EverySunday: Story = { args: { defaultValue: "FREQ=WEEKLY;BYDAY=SU" } };
/** Several days a week. */
export const MondayAndThursday: Story = { args: { defaultValue: "FREQ=WEEKLY;BYDAY=MO,TH" } };
/** On a phone: the weekday chips wrap. */
export const EverySundayMobile: Story = { ...EverySunday, globals: { viewport: { value: "mobile1" } } };
export const WithError: Story = { args: { defaultOn: true, errors: ["A repeating task needs a first due date."] } };
