import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import { RoomTemperatures } from "@/features/devices/components/room-temperatures";
import type { Device, DeviceProfile } from "@/features/devices/types/devices";
import { DEVICES_NOW, devicesFixture, profilesFixture } from "../fixtures";

function Harness({ devices, profiles, floorId }: { devices: Device[]; profiles: DeviceProfile[]; floorId: string | null }) {
  const stateOf = useDeviceStates(profiles, DEVICES_NOW);
  return <RoomTemperatures devices={devices} profiles={profiles} stateOf={stateOf} floorId={floorId} />;
}

const groundFloor = devicesFixture.find((device) => device.floorId)?.floorId ?? null;

const meta = {
  title: "Features/Devices/Components/RoomTemperatures",
  component: Harness,
  args: { devices: devicesFixture, profiles: profilesFixture, floorId: groundFloor },
  decorators: [(Story) => <div className="w-[22rem] max-w-full">{Story()}</div>],
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Average temperature per room on the floor (House page side panel); stale values are left out. */
export const Default: Story = {};
/** No temperature devices on this floor: nothing is shown. */
export const None: Story = { args: { devices: [] } };
