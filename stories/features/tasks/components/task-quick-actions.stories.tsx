import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskQuickActions } from "@/features/tasks/components/task-quick-actions";
import { taskFixtures, tasksToday } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskQuickActions",
  component: TaskQuickActions,
  args: { task: taskFixtures.vacuum, today: tasksToday, onAction: () => {} },
} satisfies Meta<typeof TaskQuickActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenTask: Story = {};
export const DoneTask: Story = { args: { task: taskFixtures.smokeDetector } };
/** A skip, snooze or reopen is being saved. */
export const Loading: Story = { args: { loading: true } };
