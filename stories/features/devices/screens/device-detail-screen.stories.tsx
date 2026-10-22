import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { DeviceDetailScreen } from "@/features/devices/screens/device-detail-screen";
import { DEVICES_NOW, deviceAppliancesFixture, deviceFixtures, devicePlacesFixture, profileFixtures, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Screens/DeviceDetailScreen",
  component: DeviceDetailScreen,
  parameters: { layout: "fullscreen" },
  args: {
    device: deviceFixtures.dryer,
    profile: profileFixtures.laundry,
    profiles: profilesFixture,
    places: devicePlacesFixture,
    appliances: deviceAppliancesFixture,
    canManage: true,
    live: false,
    now: DEVICES_NOW,
  },
} satisfies Meta<typeof DeviceDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Values from Home Assistant, linked to the dryer appliance. */
export const DryerRunning: Story = {};
/** Manual values: set them right here. */
export const SmokeDetector: Story = { args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke } };
export const NotOnThePlan: Story = { args: { device: deviceFixtures.bedroomThermostat, profile: profileFixtures.climate } };
export const Stale: Story = { args: { device: deviceFixtures.officeSensor, profile: profileFixtures.climate } };
export const AsChild: Story = { args: { canManage: false } };

/** Deleting: the confirm dialog stays open with a busy button until the delete is done. */
export const Deleting: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  },
};
/** Setting a value: the toggle flips at once (optimistic) while it saves. */
export const Loading: Story = {
  args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("group", { name: "Hall smoke detector: Bypassed" });
    await userEvent.click(within(group).getByRole("button", { name: "Bypassed" }));
  },
};
