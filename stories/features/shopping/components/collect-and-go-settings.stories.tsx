import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollectAndGoSettings } from "@/features/shopping/components/collect-and-go-settings";
const initial = { enabled: true, configured: true, connected: false, canManage: true, canUse: false, needsReconnect: false, legacyAvailable: false, importedAt: null, members: [{ id: "owner", name: "Rob", role: "owner", allowed: true }, { id: "wife", name: "Partner", role: "adult", allowed: true }, { id: "child", name: "Child", role: "child", allowed: false }] };
const meta = { title: "Features/Shopping/Components/CollectAndGoSettings", component: CollectAndGoSettings, parameters: { layout: "fullscreen" }, decorators: [(Story) => <div className="mx-auto max-w-xl p-3"><Story /></div>], args: { initial } } satisfies Meta<typeof CollectAndGoSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Imported: Story = { args: { initial: { ...initial, connected: true, canUse: true, importedAt: "2026-11-12T12:00:00Z" } } };
export const LegacySession: Story = { args: { initial: { ...initial, legacyAvailable: true } } };
export const SelectedAccount: Story = { args: { initial: { ...initial, connected: true, canManage: false, canUse: true, members: [] } } };
export const Verified: Story = { args: { initial: { ...initial, connected: true, canUse: true, verifiedAt: "2026-11-13T07:00:00Z" } } };
export const Disabled: Story = { args: { initial: { ...initial, connected: true, canUse: true, enabled: false } } };
export const NativeCart: Story = { args: { initial: { ...initial, connected: true, canUse: true, enabled: false, cartEnabled: true } } };

export const Blocked: Story = { args: { initial: { ...initial, connected: true, canUse: true, enabled: false, cartEnabled: true, needsReconnect: true, reconnectReason: "challenge" } } };
