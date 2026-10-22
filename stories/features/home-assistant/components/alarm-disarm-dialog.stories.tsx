import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, screen, userEvent } from "storybook/test";
import { AlarmDisarmDialog } from "@/features/home-assistant/components/alarm-disarm-dialog";

const meta = {
  title: "Features/HomeAssistant/Components/AlarmDisarmDialog",
  component: AlarmDisarmDialog,
  args: { panelName: "Verisure", codeFormat: "number", onConfirm: fn(async () => undefined) },
} satisfies Meta<typeof AlarmDisarmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Button: Story = {};
/** Disarming always asks for the code; it is sent once, never stored, and the attempt is logged. */
export const EnterCode: Story = { args: { defaultOpen: true } };
/** A wrong code: Home Assistant refuses, the field is cleared, the message stays. */
export const WrongCode: Story = {
  args: {
    defaultOpen: true,
    onConfirm: fn(async () => {
      throw new Error("Home Assistant refused to disarm. Is the code right?");
    }),
  },
  play: async () => {
    await userEvent.type(await screen.findByLabelText("Alarm code"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Disarm" }));
  },
};
/** Too many attempts (rate limit). */
export const TooMany: Story = {
  args: {
    defaultOpen: true,
    onConfirm: fn(async () => {
      throw new Error("Too many attempts. Wait 15 minutes and try again.");
    }),
  },
  play: async () => {
    await userEvent.type(await screen.findByLabelText("Alarm code"), "1111");
    await userEvent.click(screen.getByRole("button", { name: "Disarm" }));
  },
};
