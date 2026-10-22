import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskPriorityBadge } from "@/features/tasks/components/task-priority-badge";

const meta = {
  title: "Features/Tasks/Components/TaskPriorityBadge",
  component: TaskPriorityBadge,
  args: { priority: "high" },
} satisfies Meta<typeof TaskPriorityBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {};
export const Normal: Story = { args: { priority: "normal" } };
export const Low: Story = { args: { priority: "low" } };
export const HighIconOnly: Story = { args: { iconOnly: true } };
