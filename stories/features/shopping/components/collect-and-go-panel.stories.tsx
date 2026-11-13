import type { Meta, StoryObj } from "@storybook/react-vite";
import { CollectAndGoPanel } from "@/features/shopping/components/collect-and-go-panel";
import { connectedCollectAndGo, disconnectedCollectAndGo, collectAndGoOrderFixture } from "../collect-and-go-fixtures";
const meta = { title: "Features/Shopping/Components/CollectAndGoPanel", component: CollectAndGoPanel, args: { live: { data: connectedCollectAndGo, loading: false, refresh: async () => undefined }, initialOrder: collectAndGoOrderFixture } } satisfies Meta<typeof CollectAndGoPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const EmptyBasket: Story = { args: { live: { ...meta.args.live, data: { ...connectedCollectAndGo, cart: { ...connectedCollectAndGo.cart!, items: [] } } } } };
export const Stale: Story = { args: { live: { ...meta.args.live, data: { ...connectedCollectAndGo, cartError: "unavailable" } } } };
export const Disconnected: Story = { args: { live: { ...meta.args.live, data: disconnectedCollectAndGo } } };
export const NoAccess: Story = { args: { live: { ...meta.args.live, data: { status: { ...connectedCollectAndGo.status, canUse: false } } } } };
export const Reconnect: Story = { args: { live: { ...meta.args.live, data: { status: { ...connectedCollectAndGo.status, needsReconnect: true } } } } };

export const Blocked: Story = { args: { live: { ...meta.args.live, data: { status: { ...connectedCollectAndGo.status, needsReconnect: true, reconnectReason: "challenge" } } } } };
