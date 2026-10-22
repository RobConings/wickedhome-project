import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationBell } from "@/features/notifications";

const meta = {
  title: "Features/Notifications/Components/NotificationBell",
  component: NotificationBell,
  args: { count: 3 },
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three unread: a badge on the bell; it opens the notification center. */
export const WithCount: Story = {};

export const NothingUnread: Story = { args: { count: 0 } };

export const ManyUnread: Story = { args: { count: 128 } };

/** The count isn't loaded yet: just the bell. */
export const Loading: Story = { args: { count: null } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
