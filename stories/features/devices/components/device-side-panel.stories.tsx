import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import { DeviceSidePanel } from "@/features/devices/components/device-side-panel";
import type { Device, DeviceProfile } from "@/features/devices/types/devices";
import { DEVICES_NOW, deviceFixtures, profileFixtures, profilesFixture } from "../fixtures";

function PanelDemo({ device, profile, canSetValues }: { device: Device; profile: DeviceProfile; canSetValues: boolean }) {
  const stateOf = useDeviceStates(profilesFixture, DEVICES_NOW);
  return <DeviceSidePanel device={device} profile={profile} state={stateOf(device)} canSetValues={canSetValues} now={DEVICES_NOW} onClose={() => undefined} className="w-[22rem]" />;
}

const meta = {
  title: "Features/Devices/Components/DeviceSidePanel",
  component: PanelDemo,
  args: { device: deviceFixtures.livingThermostat, profile: profileFixtures.climate, canSetValues: true },
} satisfies Meta<typeof PanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Thermostat: Story = {};
export const AlarmPanel: Story = { args: { device: deviceFixtures.alarmPanel, profile: profileFixtures.alarmPanel } };
export const SmokeDetectorManual: Story = { args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke } };
export const AsChild: Story = { args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke, canSetValues: false } };
