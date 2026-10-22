import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskAssignees } from "@/features/tasks/components/task-assignees";
import { taskFixtures, taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskAssignees",
  component: TaskAssignees,
  args: { task: taskFixtures.jacuzzi, habitants: taskHabitants },
} satisfies Meta<typeof TaskAssignees>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shared: Story = {};
export const SharedWithNames: Story = { args: { withNames: true } };
/** Only whoever's turn it is shows, with the rotation icon. */
export const Rotating: Story = { args: { task: taskFixtures.vacuum, withNames: true } };
