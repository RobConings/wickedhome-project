import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { PresetCard } from "@/features/devices/components/preset-card";
import { presetsFixture } from "../fixtures";

const meta = {
  title: "Features/Devices/Components/PresetCard",
  component: PresetCard,
  args: { preset: presetsFixture[0]!, canManage: true, className: "w-60" },
} satisfies Meta<typeof PresetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WindowContact: Story = {};
export const Laundry: Story = { args: { preset: presetsFixture.find((preset) => preset.key === "laundry")! } };
export const AsChild: Story = { args: { canManage: false } };

/** The content of a row in the list view (the list draws the dividers and padding). */
export const Row: Story = { args: { variant: "row", className: "w-[28rem]" } };

export const Adding: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Add/ }));
  },
};
