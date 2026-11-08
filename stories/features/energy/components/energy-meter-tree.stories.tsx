import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyMeterTree } from "@/features/energy/components/energy-meter-tree";
const readings = [
  { id: "kitchen", name: "Kitchen circuit", parentId: null, energyWh: 5000 },
  { id: "fridge", name: "Fridge", parentId: "kitchen", energyWh: 1000 },
  { id: "freezer", name: "Freezer", parentId: "kitchen", energyWh: 1500 },
  { id: "unmeasured", name: "Unmeasured socket", parentId: "kitchen", energyWh: null },
];
const meta = { title: "Features/Energy/Components/EnergyMeterTree", component: EnergyMeterTree, parameters: { layout: "padded" }, args: { breakdown: { appliances: [], totalWh: 8000, unknownWh: 3000, distributions: [{ carrier: "electricity", totalWh: 8000, readings }] } } } satisfies Meta<typeof EnergyMeterTree>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Excess: Story = { args: { breakdown: { ...meta.args.breakdown, distributions: [{ carrier: "electricity", totalWh: 4000, readings: readings.map((row) => row.id === "fridge" ? { ...row, energyWh: 9000 } : row) }] } } };
export const Missing: Story = { args: { breakdown: { ...meta.args.breakdown, distributions: [{ carrier: "electricity", totalWh: null, readings: readings.map((row) => ({ ...row, energyWh: null })) }] } } };
