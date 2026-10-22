import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AlarmArmDialog } from "@/features/home-assistant/components/alarm-arm-dialog";

const meta = {
  title: "Features/HomeAssistant/Components/AlarmArmDialog",
  component: AlarmArmDialog,
  args: { mode: "away", panelName: "Verisure", codeRequired: false, codeFormat: "number", onConfirm: fn(async () => undefined) },
} satisfies Meta<typeof AlarmArmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The button; arming always goes through the confirmation. */
export const Button: Story = {};
/** The explicit confirmation before arming (away). */
export const ConfirmAway: Story = { args: { defaultOpen: true } };
export const ConfirmHome: Story = { args: { mode: "home", defaultOpen: true } };
/** The panel asks for the code to arm (numeric keypad on phones). */
export const WithCode: Story = { args: { codeRequired: true, defaultOpen: true } };
/** Home Assistant refused: the dialog stays open with the message. */
export const Failed: Story = {
  args: {
    defaultOpen: true,
    onConfirm: fn(async () => {
      throw new Error("The alarm state is unavailable: Home Assistant isn't connected.");
    }),
  },
};
/** Arming in progress: busy button, fields disabled. */
export const Arming: Story = { args: { defaultOpen: true, onConfirm: fn(() => new Promise<void>(() => undefined)) } };
