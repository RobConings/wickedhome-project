import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { HaDeviceImport } from "@/features/home-assistant/components/ha-device-import";
import { suggestionsFixture } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/HaDeviceImport",
  component: HaDeviceImport,
  args: { suggestions: suggestionsFixture, canManage: true },
} satisfies Meta<typeof HaDeviceImport>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Suggested devices with the preset they'd use; the alarm panel is already bound. */
export const Default: Story = {};
/** Two ticked, one renamed: "Import 2 devices". */
export const Selected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const boxes = canvas.getAllByRole("checkbox");
    await userEvent.click(boxes[1]!);
    await userEvent.click(boxes[4]!);
    const name = canvas.getAllByRole("textbox", { name: "Device name" })[4]!;
    await userEvent.clear(name);
    await userEvent.type(name, "Keukenraam");
  },
};
export const Empty: Story = { args: { suggestions: [] } };
