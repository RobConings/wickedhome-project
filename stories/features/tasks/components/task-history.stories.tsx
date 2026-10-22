import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskHistory } from "@/features/tasks/components/task-history";
import { taskHabitants, vacuumDetailFixture } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskHistory",
  component: TaskHistory,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { history: vacuumDetailFixture.history, habitants: taskHabitants },
} satisfies Meta<typeof TaskHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithNotes: Story = {};
export const Empty: Story = { args: { history: [] } };
