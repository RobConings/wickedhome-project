import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskBlockedDialog } from "@/features/tasks/components/task-blocked-dialog";
import { taskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskBlockedDialog",
  component: TaskBlockedDialog,
  args: { task: taskFixtures.payFluvius, open: true, onOpenChange: () => {}, onConfirm: () => {} },
} satisfies Meta<typeof TaskBlockedDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ticking off a task that still waits for another: "Complete anyway?". */
export const StillWaiting: Story = {};
