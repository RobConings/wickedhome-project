import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NotificationKindList, type NotificationPreferences } from "@/features/notifications";
import { kindsFixture, settingsFixture } from "../fixtures";

function Stateful(props: React.ComponentProps<typeof NotificationKindList>) {
  const [preferences, setPreferences] = React.useState<NotificationPreferences>(props.preferences);
  return (
    <NotificationKindList
      {...props}
      preferences={preferences}
      onChange={(kindId, preference) => setPreferences((current) => ({ ...current, kinds: { ...current.kinds, [kindId]: preference } }))}
    />
  );
}

const meta = {
  title: "Features/Notifications/Components/NotificationKindList",
  component: NotificationKindList,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { kinds: kindsFixture, preferences: settingsFixture.preferences, onChange: () => undefined },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof NotificationKindList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped kinds with on/off and, where a kind has one, the time. */
export const Default: Story = {};

/** A child sees fewer kinds (no payments, no Home Assistant connection). */
export const Child: Story = {
  args: { kinds: kindsFixture.filter((kind) => !["tasks.payments", "expenses.auto-paid", "home-assistant.connection", "integrations.mail-bills", "auth.invite-accepted"].includes(kind.id)) },
};

export const Disabled: Story = { args: { disabled: true } };

export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
