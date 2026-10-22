import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationSettingsSection } from "@/features/notifications";
import { fakeNotificationsClient, fakePushBrowser, notificationsFixture, settingsFixture } from "../fixtures";

const meta = {
  title: "Features/Notifications/Components/NotificationSettingsSection",
  component: NotificationSettingsSection,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { client: fakeNotificationsClient(), browser: fakePushBrowser() },
} satisfies Meta<typeof NotificationSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Notifications on for this phone; devices, quiet hours, kinds with times. Changes save at once. */
export const Enabled: Story = {};

/** Not on yet for this device: the button asks for permission (only on a click). */
export const NotEnabledYet: Story = { args: { browser: fakePushBrowser("available", null) } };

/** iPhone in Safari: add WickedHome to the home screen first. */
export const IPhoneInSafari: Story = { args: { browser: fakePushBrowser("ios-install", null) } };

/** Blocked in the browser or phone settings. */
export const Blocked: Story = { args: { browser: fakePushBrowser("denied", null) } };

/** The plain-HTTP LAN address: only https://home.example.be can do push. */
export const Insecure: Story = { args: { browser: fakePushBrowser("insecure", null) } };

/** No devices yet. */
export const NoDevices: Story = {
  args: { client: fakeNotificationsClient(notificationsFixture, { ...settingsFixture, devices: [] }), browser: fakePushBrowser("available", null) },
};

/** An owner, with the server's push key stored without encryption (no INTEGRATIONS_KEY). */
export const OwnerKeyNote: Story = { args: { client: fakeNotificationsClient(notificationsFixture, { ...settingsFixture, keyStorage: "plain" }) } };

/** Skeleton until the settings arrive. */
export const Loading: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { delayMs: Infinity }) } };

export const LoadError: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { fail: true }) } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
