import type { Meta, StoryObj } from "@storybook/react-vite";
import { HomeDeviceBrowser } from "@/features/devices/components/home-device-browser";
import { devicesFixture, profilesFixture } from "../fixtures";
const meta = { title: "Features/Devices/Components/HomeDeviceBrowser", component: HomeDeviceBrowser, args: { devices: devicesFixture, profiles: profilesFixture, canSetValues: true, live: false, renderControls: () => null } } satisfies Meta<typeof HomeDeviceBrowser>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllDevices: Story = {};
export const ReadOnly: Story = { args: { canSetValues: false } };
