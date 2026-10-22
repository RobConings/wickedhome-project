import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaEnergyPanel } from "@/features/home-assistant/components/ha-energy-panel";
import { appliancesFixture, energyFixture, unreachableStatus } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/HaEnergyPanel",
  component: HaEnergyPanel,
  args: { energy: energyFixture, appliances: appliancesFixture, canManage: true },
} satisfies Meta<typeof HaEnergyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grid per tariff, solar and gas from the energy dashboard; devices to link to appliances (kettle nested in kitchen). */
export const Default: Story = {};
/** Home Assistant's energy dashboard isn't set up. */
export const NoEnergyDashboard: Story = { args: { energy: { ...energyFixture, sources: null, devices: [] } } };
export const NotConnected: Story = { args: { energy: { ...energyFixture, status: unreachableStatus, sources: null, devices: [] } } };
export const NeverImported: Story = { args: { energy: { ...energyFixture, lastImportAt: null, lastResult: null } } };
export const AsChild: Story = { args: { canManage: false } };
