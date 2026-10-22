import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToolActivityChip } from "@/features/assistant/components/tool-activity-chip";

const meta = {
  title: "Features/Assistant/Components/ToolActivityChip",
  component: ToolActivityChip,
  args: { label: "Checked the shopping list", status: "done" },
} satisfies Meta<typeof ToolActivityChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {};
export const Running: Story = { args: { status: "running", label: "Checked the agenda" } };
export const Failed: Story = { args: { status: "failed", label: "Added a task", error: 'No habitant called "Cindi"' } };
export const Cancelled: Story = { args: { status: "cancelled", label: "Logged an expense" } };
