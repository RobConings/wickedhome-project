import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergySetupScreen } from "@/features/energy/screens/energy-setup-screen";
import { TODAY, eastWestSetupFixture, emptySetupFixture, setupFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Screens/EnergySetupScreen",
  component: EnergySetupScreen,
  parameters: { layout: "fullscreen", router: { initialEntries: ["/energy/setup"] } },
  args: { setup: setupFixture, today: TODAY, canManage: true },
} satisfies Meta<typeof EnergySetupScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SolarAndPlannedBattery: Story = {};
export const EastWestRoof: Story = { args: { setup: eastWestSetupFixture } };
export const Empty: Story = { args: { setup: emptySetupFixture } };
export const AsChild: Story = { args: { canManage: false } };
