import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaStatusBadge } from "@/features/home-assistant/components/ha-status-badge";

const meta = {
  title: "Features/HomeAssistant/Components/HaStatusBadge",
  component: HaStatusBadge,
  args: { state: "connected" },
} satisfies Meta<typeof HaStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const Connecting: Story = { args: { state: "connecting" } };
export const Error: Story = { args: { state: "error" } };
export const NotConfigured: Story = { args: { state: "not_configured" } };
