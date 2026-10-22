import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApplianceBadge } from "@/features/energy/components/appliance-badge";
import { applianceFixtures } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/ApplianceBadge",
  component: ApplianceBadge,
  args: { appliance: applianceFixtures.jacuzzi },
} satisfies Meta<typeof ApplianceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const HeatPump: Story = { args: { appliance: applianceFixtures.heatPump } };
export const LongName: Story = { args: { appliance: { name: "Office PC, two screens and the printer", category: "it_media" } } };
