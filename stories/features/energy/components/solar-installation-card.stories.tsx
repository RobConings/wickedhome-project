import type { Meta, StoryObj } from "@storybook/react-vite";
import { SolarInstallationCard } from "@/features/energy/components/solar-installation-card";
import { eastWestSetupFixture, solarFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/SolarInstallationCard",
  component: SolarInstallationCard,
  decorators: [(Story) => <div className="w-[26rem]">{Story()}</div>],
  args: { installation: solarFixture, canManage: true },
} satisfies Meta<typeof SolarInstallationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SouthRoof: Story = {};
export const Minimal: Story = { args: { installation: eastWestSetupFixture.solarInstallations[1] ?? solarFixture } };
export const ReadOnly: Story = { args: { canManage: false } };
