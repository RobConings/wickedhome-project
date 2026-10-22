import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskReadinessBadge } from "@/features/tasks/components/task-readiness-badge";
import { taskFixtures } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskReadinessBadge",
  component: TaskReadinessBadge,
  args: { task: taskFixtures.jacuzzi },
} satisfies Meta<typeof TaskReadinessBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WaitingForMaterials: Story = {};
export const WaitingCompact: Story = { args: { compact: true } };
export const ReadyToStart: Story = { args: { task: taskFixtures.descale } };
export const Done: Story = { args: { task: taskFixtures.smokeDetector } };
