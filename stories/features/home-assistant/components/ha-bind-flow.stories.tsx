import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { DeviceBindingsForm } from "@/features/devices/components/device-bindings-form";
import { HaEntityPickerDialog } from "@/features/home-assistant/components/ha-entity-picker-dialog";
import { deviceFixtures, profileFixtures } from "../../devices/fixtures";
import { connectedStatus, entitiesFixture } from "../fixtures";

/**
 * The bind flow as the device page composes it: the devices feature's value sources form with Home
 * Assistant's entity picker in its slot. Picking an entity switches the field to Home Assistant; saving
 * takes the entity's current state and follows it live.
 */
const meta = {
  title: "Features/HomeAssistant/Components/BindFlow",
  component: DeviceBindingsForm,
  args: {
    device: deviceFixtures.bedroomThermostat,
    profile: profileFixtures.climate,
    renderEntityPicker: (props) => <HaEntityPickerDialog {...props} entities={entitiesFixture} status={connectedStatus} />,
  },
} satisfies Meta<typeof DeviceBindingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Browse → pick "Bedroom temperature": the field switches to Home Assistant with that entity; Save enables. */
export const PickAnEntity: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole("button", { name: "Browse" })[0]!);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByText("Bedroom temperature"));
  },
};
