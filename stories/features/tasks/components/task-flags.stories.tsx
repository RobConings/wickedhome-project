import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskCommentCount, TaskHoldBadge, TaskOriginBadge, TaskProjectChip, TaskWaitingBadge } from "@/features/tasks/components/task-flags";
import { taskFixtures } from "../fixtures";

function Flags({ full = false }: { full?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <TaskOriginBadge task={taskFixtures.bins} full={full} />
      <TaskOriginBadge task={taskFixtures.payFluvius} full={full} />
      <TaskHoldBadge task={taskFixtures.payFluvius} full={full} />
      <TaskWaitingBadge task={taskFixtures.payFluvius} />
      <TaskCommentCount task={taskFixtures.payFluvius} />
      <TaskProjectChip task={{ project: { id: "pr-bathroom", name: "Bathroom renovation", color: "#3b82b6" } }} />
    </div>
  );
}

const meta = {
  title: "Features/Tasks/Components/TaskFlags",
  component: Flags,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Flags>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Compact, as on rows: where it comes from, on hold, waiting for, comments. */
export const Compact: Story = {};
/** Spelled out, as on the task page: the origin links back, the hold shows its reason. */
export const Full: Story = { args: { full: true } };
