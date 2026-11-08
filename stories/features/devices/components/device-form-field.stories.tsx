import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeviceFormField } from "@/features/devices/components/device-form-field";
import { devicesOverviewFixture, deviceSelectionsFixture } from "../fixtures";
const meta = {
  title: "Features/Devices/Components/DeviceFormField",
  component: DeviceFormField,
  args: { initialData: devicesOverviewFixture, initialSelections: deviceSelectionsFixture },
} satisfies Meta<typeof DeviceFormField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { defaultValue: devicesOverviewFixture.devices[0]!.id } };
