import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationsScreen } from "@/features/notifications";
import { NOW, fakeNotificationsClient, notificationsFixture, settingsFixture } from "../fixtures";

const meta = {
  title: "Features/Notifications/Screens/NotificationsScreen",
  component: NotificationsScreen,
  parameters: { layout: "fullscreen" },
  args: { userId: "user-rob", client: fakeNotificationsClient(), live: false, now: NOW },
} satisfies Meta<typeof NotificationsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three unread (bins, the alarm, a payment) and older read ones. Tap one to mark it read; "Mark all as read". */
export const Default: Story = {};

/** Pages of four: "Show older" loads more. */
export const Paged: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { pageSize: 4 }) } };

export const AllRead: Story = {
  args: { client: fakeNotificationsClient(notificationsFixture.map((item) => ({ ...item, readAt: item.readAt ?? item.createdAt }))) },
};

export const Empty: Story = { args: { client: fakeNotificationsClient([]) } };

/** Skeleton rows until the first page arrives. */
export const Loading: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { delayMs: Infinity }) } };

export const LoadError: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { fail: true }) } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
