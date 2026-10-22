import type { Meta, StoryObj } from "@storybook/react-vite";
import { useDeviceStates } from "@/features/devices/components/device-indicator";
import { DeviceStateChip } from "@/features/devices/components/device-state-chip";
import { DEVICES_NOW, devicesFixture, profilesFixture } from "../fixtures";

/** Every sample device's state, as computed by the rule engine. */
function AllStates({ showValue = true }: { showValue?: boolean }) {
  const stateOf = useDeviceStates(profilesFixture, DEVICES_NOW);
  return (
    <ul className="flex flex-col gap-2">
      {devicesFixture.map((device) => {
        const state = stateOf(device);
        return (
          <li key={device.id} className="flex items-center justify-between gap-6 text-sm">
            <span>{device.name}</span>
            {state && <DeviceStateChip state={state} showValue={showValue} />}
          </li>
        );
      })}
    </ul>
  );
}

const meta = {
  title: "Features/Devices/Components/DeviceStateChip",
  component: AllStates,
} satisfies Meta<typeof AllStates>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleHouse: Story = {};
export const WithoutValues: Story = { args: { showValue: false } };
