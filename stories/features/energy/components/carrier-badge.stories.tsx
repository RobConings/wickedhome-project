import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarrierBadge } from "@/features/energy/components/carrier-badge";

const meta = {
  title: "Features/Energy/Components/CarrierBadge",
  component: CarrierBadge,
  args: { carrier: "gas" },
} satisfies Meta<typeof CarrierBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gas: Story = {};
export const Electricity: Story = { args: { carrier: "electricity" } };
export const Water: Story = { args: { carrier: "water" } };
