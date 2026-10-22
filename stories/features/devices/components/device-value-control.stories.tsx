import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DeviceValueControl } from "@/features/devices/components/device-value-control";
import { profileFixtures } from "../fixtures";

const field = (profile: { fields: { key: string }[] }, key: string) => {
  const found = profile.fields.find((candidate) => candidate.key === key);
  if (!found) throw new Error(key);
  return found as (typeof profileFixtures.contact.fields)[number];
};

const meta = {
  title: "Features/Devices/Components/DeviceValueControl",
  component: DeviceValueControl,
  args: { deviceId: "d-kitchen-left", field: field(profileFixtures.contact, "isOpen"), value: true, label: "Kitchen window: Open" },
} satisfies Meta<typeof DeviceValueControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Booleans: a two-way toggle with the field's own words (Open / Closed). */
export const Boolean: Story = {};
export const Number: Story = { args: { field: field(profileFixtures.climate, "temperature"), value: 21.5, label: "Thermostat: Temperature" } };
export const Choice: Story = { args: { field: field(profileFixtures.alarmPanel, "state"), value: "armed_home", label: "Alarm panel: State" } };
export const Unknown: Story = { args: { field: field(profileFixtures.climate, "temperature"), value: null, label: "Thermostat: Temperature" } };
export const SaveFails: Story = {
  parameters: { router: { action: async () => ({ formError: "This value comes from Home Assistant and can't be set by hand." }) } },
};

/** Toggles are optimistic: the new state shows at once while it saves. */
export const SavingToggle: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Closed" }));
  },
};
/** Typed values show a busy button while saving. */
export const SavingNumber: Story = {
  args: { field: field(profileFixtures.climate, "temperature"), value: 21.5, label: "Thermostat: Temperature" },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Thermostat: Temperature" });
    await userEvent.clear(input);
    await userEvent.type(input, "19,5");
    await userEvent.click(canvas.getByRole("button", { name: "Set value" }));
  },
};
