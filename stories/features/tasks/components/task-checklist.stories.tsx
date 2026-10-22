import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { TaskChecklist } from "@/features/tasks/components/task-checklist";
import { taskFixtures } from "../fixtures";

const halfway = {
  ...taskFixtures.gutters,
  checklist: taskFixtures.gutters.checklist.map((item, index) => ({ ...item, done: index === 0 })),
};

const meta = {
  title: "Features/Tasks/Components/TaskChecklist",
  component: TaskChecklist,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { task: halfway, canToggle: true },
} satisfies Meta<typeof TaskChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Halfway: Story = {};
export const ReadOnly: Story = { args: { canToggle: false } };

/** Ticking off two steps quickly: both show as done at once (and in the count) while they save. */
export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const boxes = within(canvasElement).getAllByRole("checkbox");
    for (const box of boxes.slice(1, 3)) await userEvent.click(box);
  },
};
