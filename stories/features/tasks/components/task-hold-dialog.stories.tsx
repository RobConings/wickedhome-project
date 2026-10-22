import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskHoldDialog } from "@/features/tasks/components/task-hold-dialog";
import { taskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskHoldDialog",
  component: TaskHoldDialog,
  args: { task: taskFixtures.invoice, open: true, onOpenChange: () => {}, onHold: () => {} },
} satisfies Meta<typeof TaskHoldDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PutOnHold: Story = {};
/** Saving: the button stays busy until the hold is saved. */
export const Saving: Story = { args: { onHold: () => new Promise(() => undefined) } };
