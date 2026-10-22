import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceValuesList } from "@/features/devices/components/device-values-list";
import { DEVICES_NOW, deviceFixtures, profileFixtures } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/DeviceValuesList",
  component: DeviceValuesList,
  args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke, canSetValues: true, now: DEVICES_NOW, className: "w-[32rem]" },
} satisfies Meta<typeof DeviceValuesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Manual values: settable by adults. */
export const Manual: Story = {};
/** Values from Home Assistant can't be set by hand; they show their entity. */
export const FromHomeAssistant: Story = { args: { device: deviceFixtures.dryer, profile: profileFixtures.laundry } };
/** Home Assistant stopped reporting three hours ago. */
export const Stale: Story = { args: { device: deviceFixtures.officeSensor, profile: profileFixtures.climate } };
export const AsChild: Story = { args: { canSetValues: false } };
