import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, screen, userEvent, within } from "storybook/test";
import { HaEntityPickerDialog } from "@/features/home-assistant/components/ha-entity-picker-dialog";
import { connectedStatus, entitiesFixture, unreachableStatus } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/HaEntityPickerDialog",
  component: HaEntityPickerDialog,
  args: { fieldLabel: "Temperature", fieldType: "number", entities: entitiesFixture, status: connectedStatus, onPick: fn() },
} satisfies Meta<typeof HaEntityPickerDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The "Browse" button next to a field's entity input. */
export const Closed: Story = {};

/** Opened for a number field: only numeric entities by default. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Browse" }));
    await screen.findByRole("dialog");
  },
};

/** Picking an entity with attributes asks what to read: the state, or e.g. `current_temperature`. */
export const ChooseAttribute: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Browse" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByText("Living thermostat"));
    await userEvent.click(await within(dialog).findByText("current_temperature"));
  },
};

/** Home Assistant isn't connected: the dialog says so instead of an empty list. */
export const NotConnected: Story = {
  args: { status: unreachableStatus, entities: [] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Browse" }));
  },
};
