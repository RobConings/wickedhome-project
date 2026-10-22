import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskTypeBadge } from "@/features/tasks/components/task-type-badge";
import { TASK_TYPES } from "@/features/tasks/types/tasks";

const meta = {
  title: "Features/Tasks/Components/TaskTypeBadge",
  component: TaskTypeBadge,
  args: { type: "job" },
} satisfies Meta<typeof TaskTypeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Job: Story = {};
export const IconOnly: Story = { args: { iconOnly: true } };
export const AllTypes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TASK_TYPES.map((type) => (
        <TaskTypeBadge key={type} type={type} />
      ))}
    </div>
  ),
};
