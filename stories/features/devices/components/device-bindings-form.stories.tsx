import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DeviceBindingsForm } from "@/features/devices/components/device-bindings-form";
import { deviceFixtures, profileFixtures } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/DeviceBindingsForm",
  component: DeviceBindingsForm,
  parameters: { layout: "padded" },
  args: { device: deviceFixtures.kitchenWindowLeft, profile: profileFixtures.contact },
} satisfies Meta<typeof DeviceBindingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HomeAssistant: Story = {};
export const AllManual: Story = { args: { device: deviceFixtures.hallSmoke, profile: profileFixtures.smoke } };
export const SaveFails: Story = {
  parameters: { router: { action: async () => ({ formError: "Check the Home Assistant entity ids (e.g. binary_sensor.kitchen_window)." }) } },
};

export const Saving: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [entity] = canvas.getAllByRole("textbox", { name: "Home Assistant entity" });
    if (!entity) return;
    await userEvent.clear(entity);
    await userEvent.type(entity, "binary_sensor.kitchen_left");
    await userEvent.click(canvas.getByRole("button", { name: "Save sources" }));
  },
};
