import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@/components/shared/card";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import { DeviceRow } from "@/features/devices/components/device-row";
import type { Device } from "@/features/devices/types/devices";
import { DEVICES_NOW, deviceFixtures, profilesFixture } from "../fixtures";

/** Rows as `GeneralList` shows them: the list draws the dividers and padding around each row. */
function RowList({ devices }: { devices: Device[] }) {
  const stateOf = useDeviceStates(profilesFixture, DEVICES_NOW);
  return (
    <Card className="w-[36rem] max-w-full gap-0 px-4 py-1 sm:px-5">
      <div role="list" className="flex flex-col divide-y">
        {devices.map((device) => (
          <div key={device.id} role="listitem" className="flex min-h-10 min-w-0 flex-col justify-center py-2.5">
            <DeviceRow device={device} profile={profilesFixture.find((profile) => profile.id === device.profileId)} state={stateOf(device)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

const meta = {
  title: "Features/Devices/Components/DeviceRow",
  component: RowList,
  args: { devices: [deviceFixtures.kitchenWindowLeft, deviceFixtures.livingThermostat, deviceFixtures.dryer, deviceFixtures.bedroomThermostat, deviceFixtures.officeSensor] },
} satisfies Meta<typeof RowList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};
