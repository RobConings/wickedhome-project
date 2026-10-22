import type { Meta, StoryObj } from "@storybook/react-vite";
import { DevicePicker } from "@/features/devices/components/device-picker";
import { deviceSelectionsFixture, devicesFixture, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/DevicePicker",
  component: DevicePicker,
  args: { devices: devicesFixture, profiles: profilesFixture, initialSelections: deviceSelectionsFixture, className: "w-72" },
} satisfies Meta<typeof DevicePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Preselected: Story = { args: { defaultValue: "d-jacuzzi", clearable: true } };
