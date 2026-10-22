import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ColorSwatchPicker } from "@/components/shared/color-swatch-picker";

const meta = {
  title: "Shared/ColorSwatchPicker",
  component: ColorSwatchPicker,
  args: {
    name: "color",
    label: "Colour",
    colors: ["#124734", "#3b82b6", "#7c5cc4", "#c2508a", "#d4573b", "#d9912b", "#7d9a3c", "#6b7280"],
    defaultValue: "#3b82b6",
    onChange: fn(),
  },
} satisfies Meta<typeof ColorSwatchPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
