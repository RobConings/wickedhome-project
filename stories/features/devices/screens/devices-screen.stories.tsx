import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DevicesScreen } from "@/features/devices/screens/devices-screen";
import { DEVICES_NOW, deviceAppliancesFixture, devicePlacesFixture, devicesFixture, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Screens/DevicesScreen",
  component: DevicesScreen,
  parameters: { layout: "fullscreen" },
  args: {
    devices: devicesFixture,
    profiles: profilesFixture,
    places: devicePlacesFixture,
    appliances: deviceAppliancesFixture,
    canManage: true,
    live: false,
    now: DEVICES_NOW,
  },
} satisfies Meta<typeof DevicesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleHouse: Story = {};
export const NoDevicesYet: Story = { args: { devices: [] } };
export const NoProfilesYet: Story = { args: { devices: [], profiles: [] } };
export const AsChild: Story = { args: { canManage: false } };

/** Reloading on the same page (after a change, a reconnect): the list fades with a spinner. */
export const Loading: Story = { args: { pending: true } };

/** Search looks in the name, profile, place and appliance: "thermostat" keeps two devices in two places. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "thermostat");
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
