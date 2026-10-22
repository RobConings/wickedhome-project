import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotifyMeToggle } from "@/features/notifications";
import { fakeNotificationsClient, notificationsFixture, settingsFixture } from "../fixtures";

const meta = {
  title: "Features/Notifications/Components/NotifyMeToggle",
  component: NotifyMeToggle,
  args: { kind: "devices.indicator", scopeId: "device:d3", name: "Window bedroom", client: fakeNotificationsClient() },
} satisfies Meta<typeof NotifyMeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Not followed yet: tap to get a notification when it turns orange or red. */
export const Off: Story = {};

/** Already followed. */
export const On: Story = { args: { scopeId: "device:d1" } };

/** Disabled until the current state is known. */
export const Loading: Story = { args: { client: fakeNotificationsClient(notificationsFixture, settingsFixture, { delayMs: Infinity }) } };

/** Saving fails: the button flips back with a toast. */
export const SaveFails: Story = { args: { client: { ...fakeNotificationsClient(), setScope: () => Promise.reject(new Error("Fake failure")) } } };
