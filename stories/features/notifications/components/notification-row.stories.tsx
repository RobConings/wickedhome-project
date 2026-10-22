import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationRow, NotificationTile } from "@/features/notifications";
import { NOW, notificationsFixture } from "../fixtures";

const [bins, alarm, , digest] = notificationsFixture;

const meta = {
  title: "Features/Notifications/Components/NotificationRow",
  component: NotificationRow,
  decorators: [(Story) => <div className="w-[36rem] max-w-full">{Story()}</div>],
  args: { notification: bins!, now: NOW },
} satisfies Meta<typeof NotificationRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Unread: bold title and a "New" badge. */
export const Unread: Story = {};

export const Read: Story = { args: { notification: digest! } };

/** The alarm: red icon and an "Urgent" badge. */
export const Urgent: Story = { args: { notification: alarm! } };

export const Tile: Story = { render: (args) => <NotificationTile {...args} /> };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
