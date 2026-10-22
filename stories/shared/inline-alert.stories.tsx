import type { Meta, StoryObj } from "@storybook/react-vite";
import { InlineAlert } from "@/components/shared/inline-alert";

const meta = {
  title: "Shared/InlineAlert",
  component: InlineAlert,
  decorators: [(Story) => <div className="w-96"><Story /></div>],
  args: { children: "Something you should know about." },
} satisfies Meta<typeof InlineAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Success: Story = { args: { tone: "success", children: "Saved." } };
export const Warning: Story = { args: { tone: "warning", children: "The live connection dropped; values may be out of date." } };
export const ErrorTone: Story = { args: { tone: "error", children: "That email and password don't match." } };
