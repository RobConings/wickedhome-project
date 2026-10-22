import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskStats } from "@/features/tasks/components/task-stats";
import { taskFixtures, tasksToday } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskStats",
  component: TaskStats,
  parameters: { layout: "padded" },
  args: { tasks: Object.values(taskFixtures), today: tasksToday, currentHabitantId: "h1" },
} satisfies Meta<typeof TaskStats>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mine: Story = {};
export const WithoutHabitant: Story = { args: { currentHabitantId: null } };
export const AllClear: Story = { args: { tasks: [taskFixtures.chimney] } };
