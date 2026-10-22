import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyCarrierTabs } from "@/features/energy/components/energy-carrier-tabs";

const meta = {
  title: "Features/Energy/Components/EnergyCarrierTabs",
  component: EnergyCarrierTabs,
  args: { carrier: "electricity", period: "month", date: "2026-09-01" },
} satisfies Meta<typeof EnergyCarrierTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Electricity: Story = {};
export const Gas: Story = { args: { carrier: "gas" } };
export const Total: Story = { args: { carrier: "total" } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
