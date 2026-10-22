import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveStatusBadge } from "@/features/devices/components/live-status-badge";

const meta = {
  title: "Features/Devices/Components/LiveStatusBadge",
  component: LiveStatusBadge,
  args: { status: "open" },
} satisfies Meta<typeof LiveStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
/** Live, while the page reloads its data in the background. */
export const Updating: Story = { args: { refreshing: true } };
export const Connecting: Story = { args: { status: "connecting" } };
export const Reconnecting: Story = { args: { status: "reconnecting" } };
/** The browser is offline or several reconnects failed; it keeps trying. */
export const Offline: Story = { args: { status: "offline" } };
