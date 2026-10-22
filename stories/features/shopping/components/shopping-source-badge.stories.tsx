import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingSourceBadge } from "@/features/shopping/components/shopping-source-badge";

const meta = {
  title: "Features/Shopping/Components/ShoppingSourceBadge",
  component: ShoppingSourceBadge,
  args: { source: "staple" },
} satisfies Meta<typeof ShoppingSourceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Staple: Story = {};
export const Manual: Story = { args: { source: "manual" } };
export const Task: Story = { args: { source: "task" } };
export const TaskWithTitle: Story = { args: { source: "task", taskTitle: "Insulate the jacuzzi" } };
export const LowStock: Story = { args: { source: "low_stock" } };
