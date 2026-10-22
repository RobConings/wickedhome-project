import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageGrid } from "../../../../src/features/devices/components/page-grid";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import { DeviceTile } from "@/features/devices/components/device-tile";
import type { Device } from "@/features/devices/types/devices";
import { DEVICES_NOW, deviceFixtures, profilesFixture } from "../fixtures";

/** Tiles as `GeneralList` shows them in its tiles view. */
function TileGrid({ devices }: { devices: Device[] }) {
  const stateOf = useDeviceStates(profilesFixture, DEVICES_NOW);
  return (
    <PageGrid columns="tiles" className="max-w-3xl">
      {devices.map((device) => (
        <div key={device.id} className="flex min-w-0 flex-col *:flex-1">
          <DeviceTile device={device} profile={profilesFixture.find((profile) => profile.id === device.profileId)} state={stateOf(device)} />
        </div>
      ))}
    </PageGrid>
  );
}

const meta = {
  title: "Features/Devices/Components/DeviceTile",
  component: TileGrid,
  parameters: { layout: "padded" },
  args: {
    devices: [
      deviceFixtures.kitchenWindowLeft,
      deviceFixtures.livingThermostat,
      deviceFixtures.dryer,
      deviceFixtures.bedroomThermostat,
      deviceFixtures.officeSensor,
      deviceFixtures.jacuzzi,
    ],
  },
} satisfies Meta<typeof TileGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};

/** A device whose profile is gone: no state, "missing profile". */
export const WithoutProfile: Story = { args: { devices: [{ ...deviceFixtures.livingWindow, profileId: "dp-gone" }] } };
