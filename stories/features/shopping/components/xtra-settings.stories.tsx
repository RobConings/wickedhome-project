import type { Meta, StoryObj } from "@storybook/react-vite";
import { XtraSettings } from "@/features/shopping/components/xtra-settings";
const meta = {
  title: "Features/Shopping/Components/XtraSettings", component: XtraSettings,
  decorators: [(Story) => <div className="mx-auto max-w-xl p-3"><Story /></div>],
  args: { initial: { configured: true, connected: true, canUse: true, canManage: true, needsReconnect: false, connectedAt: "2026-11-12T12:00:00Z", checkedAt: "2026-11-12T12:00:00Z", placeId: "1234", members: [{ id: "owner", name: "Rob", role: "owner", allowed: true }, { id: "wife", name: "Partner", role: "adult", allowed: true }, { id: "child", name: "Child", role: "child", allowed: false }] } },
} satisfies Meta<typeof XtraSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Shared: Story = {};
export const Reconnect: Story = { args: { initial: { ...meta.args.initial, needsReconnect: true } } };
export const SelectedAccount: Story = { args: { initial: { ...meta.args.initial, canManage: false, members: [] } } };
