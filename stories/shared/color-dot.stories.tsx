import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColorDot } from "@/components/shared/color-dot";

const meta = {
  title: "Shared/ColorDot",
  component: ColorDot,
  parameters: { layout: "padded" },
  args: { color: "#3b82f6" },
} satisfies Meta<typeof ColorDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { className: "size-3.5 shrink-0 rounded-full" } };
