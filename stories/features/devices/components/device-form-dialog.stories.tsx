import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { Button } from "@/components/ui/button";
import { DeviceFormDialog } from "@/features/devices/components/device-form-dialog";
import { deviceAppliancesFixture, deviceFixtures, devicePlacesFixture, profilesFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/DeviceFormDialog",
  component: DeviceFormDialog,
  args: {
    profiles: profilesFixture,
    places: devicePlacesFixture,
    appliances: deviceAppliancesFixture,
    trigger: <Button>Open form</Button>,
  },
} satisfies Meta<typeof DeviceFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {};
export const Edit: Story = { args: { device: deviceFixtures.dryer } };
export const ValidationError: Story = {
  parameters: { router: { action: async () => ({ errors: { name: ["Required"] }, intent: "save" }) } },
};

/** Saving: the dialog stays open with a busy button and disabled fields until the save is done. */
export const Saving: Story = {
  args: { device: deviceFixtures.dryer },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open form" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
  },
};
