import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleHelpIcon, FanIcon, WavesIcon } from "lucide-react";
import { BreakdownBars } from "@/components/shared/breakdown-bars";

const meta = {
  title: "Shared/BreakdownBars",
  component: BreakdownBars,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: {
    label: "Consumption per appliance",
    max: 261,
    items: [
      { key: "jacuzzi", label: "Jacuzzi", leading: <WavesIcon className="size-4" />, value: 73, valueLabel: "73 kWh", shareLabel: "28%" },
      { key: "heatpump", label: "Heat pump", leading: <FanIcon className="size-4" />, value: 18, valueLabel: "18,3 kWh", shareLabel: "7%" },
      { key: "unknown", label: "Unknown", leading: <CircleHelpIcon className="size-4" />, value: 170, valueLabel: "170 kWh", shareLabel: "65%", muted: true },
    ],
  },
} satisfies Meta<typeof BreakdownBars>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PartsOfWhole: Story = {};
export const Ranked: Story = {
  args: {
    max: undefined,
    items: [
      { key: "a", label: "Groceries", value: 412, valueLabel: "€ 412" },
      { key: "b", label: "Energy", value: 189, valueLabel: "€ 189" },
      { key: "c", label: "Internet & phone", value: 74, valueLabel: "€ 74" },
    ],
  },
};
export const AllRemainder: Story = {
  args: { items: [{ key: "unknown", label: "Unknown", value: 261, valueLabel: "261 kWh", shareLabel: "100%", muted: true }] },
};
