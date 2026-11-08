import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergySourceScreen } from "@/features/energy/screens/energy-source-screen";
import { solarFixture, batteryFixture } from "../fixtures";
const meta = {
  title: "Features/Energy/Screens/EnergySourceScreen", component: EnergySourceScreen,
  parameters: { layout: "fullscreen" },
  args: { solar: solarFixture, battery: null, meters: [], today: "2026-10-02", canManage: true },
} satisfies Meta<typeof EnergySourceScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Battery: Story = { args: { solar: null, battery: batteryFixture } };
