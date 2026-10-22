import type { Meta, StoryObj } from "@storybook/react-vite";
import { HouseScreen } from "@/features/devices/screens/house-screen";
import { DEVICES_NOW, devicesFixture, housePlansFixture, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Screens/HouseScreen",
  component: HouseScreen,
  parameters: { layout: "fullscreen" },
  args: { plans: housePlansFixture, devices: devicesFixture, profiles: profilesFixture, canSetValues: true, live: false, now: DEVICES_NOW },
} satisfies Meta<typeof HouseScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The ground floor: kitchen window open, thermostat comfortable, dryer running, alarm armed (home). */
export const GroundFloor: Story = {};
/** A device selected on the plan: its values and controls in the side panel. */
export const DeviceSelected: Story = { args: { initialDeviceId: "d-living-thermostat" } };
export const Outside: Story = { parameters: { router: { initialEntries: ["/house?floor=f-outside"] } } };
export const NoFloors: Story = { args: { plans: [] } };
export const AsChild: Story = { args: { canSetValues: false, initialDeviceId: "d-hall-smoke" } };

/** Live connection states, shown in the header badge. */
export const Connecting: Story = { args: { liveStatus: "connecting" } };
export const Reconnecting: Story = { args: { liveStatus: "reconnecting" } };
export const Offline: Story = { args: { liveStatus: "offline" } };
/** Same as Connecting: the plan is there at once, the badge says the live link is coming up. */
export const Loading: Story = { args: { liveStatus: "connecting", initialDeviceId: "d-dryer" } };
