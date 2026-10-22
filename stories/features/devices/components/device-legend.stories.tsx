import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceLegend } from "@/features/devices/components/device-legend";
import { profileFixtures, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/DeviceLegend",
  component: DeviceLegend,
  args: { profiles: [profileFixtures.contact, profileFixtures.climate, profileFixtures.laundry], className: "rounded-xl border bg-popover p-3" },
} satisfies Meta<typeof DeviceLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GroundFloor: Story = {};
export const AllProfiles: Story = { args: { profiles: profilesFixture } };
export const ListLayout: Story = { args: { layout: "list" } };
