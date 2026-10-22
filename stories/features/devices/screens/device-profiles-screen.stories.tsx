import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DeviceProfilesScreen } from "@/features/devices/screens/device-profiles-screen";
import { presetsFixture, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Screens/DeviceProfilesScreen",
  component: DeviceProfilesScreen,
  parameters: { layout: "fullscreen" },
  args: { profiles: profilesFixture, presets: presetsFixture, canManage: true },
} satisfies Meta<typeof DeviceProfilesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleHouse: Story = {};
export const FirstVisit: Story = { args: { profiles: [] } };
export const AsChild: Story = { args: { canManage: false } };

/** Search covers profiles and presets: "alarm" finds both kinds. */
export const Searching: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox"), "alarm");
  },
};

/** Adding a preset: busy button until the new profile opens. */
export const Loading: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add Light" }));
  },
};
