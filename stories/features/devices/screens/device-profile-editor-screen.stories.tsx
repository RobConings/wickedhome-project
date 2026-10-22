import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DeviceProfileEditorScreen } from "@/features/devices/screens/device-profile-editor-screen";
import { profileFixtures } from "../fixtures";

const meta = {
  title: "Features/Devices/Screens/DeviceProfileEditorScreen",
  component: DeviceProfileEditorScreen,
  parameters: { layout: "fullscreen" },
  args: { profile: profileFixtures.climate, canManage: true, initialSampleValues: { temperature: 21.5, humidity: 48 } },
} satisfies Meta<typeof DeviceProfileEditorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Temperature bands with a live preview: change the sample temperature or the rules. */
export const TemperatureAndHumidity: Story = {};
export const SmokeDetector: Story = { args: { profile: profileFixtures.smoke, initialSampleValues: { triggered: false, bypassed: false, battery: 12 } } };
export const CustomJacuzzi: Story = { args: { profile: profileFixtures.jacuzzi, initialSampleValues: { temperature: 33, heating: true } } };
export const NewProfile: Story = { args: { profile: null, initialSampleValues: {} } };
export const AsChild: Story = { args: { canManage: false } };
export const SaveFails: Story = {
  parameters: { router: { action: async () => ({ formError: "The profile isn't complete yet." }) } },
};

/** Saving: busy button, fields and rules locked until the save is done. */
export const Loading: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), " (living)");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
  },
};
