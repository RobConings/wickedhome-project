import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskComments } from "@/features/tasks/components/task-comments";
import { payTaskDetailFixture, taskHabitants } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskComments",
  component: TaskComments,
  parameters: { layout: "padded" },
  args: { taskId: payTaskDetailFixture.task.id, comments: payTaskDetailFixture.comments, habitants: taskHabitants },
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof TaskComments>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The payment's thread: own comments can be edited or deleted. */
export const Thread: Story = {};
export const Empty: Story = { args: { comments: [] } };
/** Sending: the new comment shows at once, faded, until it's saved. */
export const Sending: Story = { parameters: { router: { action: () => new Promise(() => undefined) } } };
