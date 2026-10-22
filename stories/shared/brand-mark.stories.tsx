import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandMark } from "@/components/shared/brand-mark";

const meta = {
  title: "Shared/BrandMark",
  component: BrandMark,
} satisfies Meta<typeof BrandMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const IconOnly: Story = { args: { iconOnly: true } };
export const WithTagline: Story = { args: { withTagline: true, size: "lg" } };
