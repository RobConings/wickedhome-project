import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskLinksPanel } from "@/features/tasks/components/task-links";
import { jacuzziDetailFixture, payTaskDetailFixture } from "../fixtures";

const meta = {
  title: "Features/Tasks/Components/TaskLinksPanel",
  component: TaskLinksPanel,
  parameters: { layout: "padded" },
  args: { taskId: payTaskDetailFixture.task.id, links: payTaskDetailFixture.links, canManage: true },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof TaskLinksPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Blocked: the payment waits for "Calculate the Fluvius invoice". */
export const Waiting: Story = {};
/** The blocker is done (struck through): actionable again; plus a related task. */
export const BlockerDone: Story = { args: { taskId: jacuzziDetailFixture.task.id, links: jacuzziDetailFixture.links } };
export const NoLinks: Story = { args: { links: { blockedBy: [], blocks: [], related: [] } } };
export const ReadOnly: Story = { args: { canManage: false } };
