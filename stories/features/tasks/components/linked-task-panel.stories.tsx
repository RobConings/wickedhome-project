import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkedTaskPanel } from "@/features/tasks/components/linked-task-panel";
import { binsTaskDetailFixture, payTaskDetailFixture, taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/LinkedTaskPanel",
  component: LinkedTaskPanel,
  parameters: { layout: "padded" },
  args: {
    originType: "expense",
    originId: "x-fluvius",
    title: "Payment task",
    initialData: { detail: payTaskDetailFixture, habitants: taskHabitants },
  },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof LinkedTaskPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On an expense page: the pay task, on hold and waiting for the invoice check, with the payment's thread. */
export const PayTaskOnHold: Story = {};
export const BinsTask: Story = { args: { originType: "waste", originId: "2026-10-03", title: undefined, initialData: { detail: binsTaskDetailFixture, habitants: taskHabitants } } };
/** No task: a direct debit is collected automatically. */
export const NoTask: Story = { args: { initialData: { detail: null, habitants: taskHabitants }, emptyText: "Paid by direct debit: no task needed." } };
/** Loading its own data: a skeleton shaped like the panel. */
export const Loading: Story = { args: { initialData: undefined } };
