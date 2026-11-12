import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantProviderSettings } from "@/features/assistant/components/assistant-provider-settings";
const meta = { title: "Features/Assistant/Components/AssistantProviderSettings", component: AssistantProviderSettings, parameters: { layout: "fullscreen" }, decorators: [(Story) => <div className="mx-auto max-w-lg p-3"><Story /></div>], args: { initial: { provider: "local", model: "local-model", connected: false, permission: false, storageReady: true, accountId: null, accounts: [], models: [], local: { model: "local-model", configured: true }, usageUrl: "https://chatgpt.com/settings/usage", error: null } } } satisfies Meta<typeof AssistantProviderSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Connected: Story = { args: { initial: { ...meta.args.initial, provider: "chatgpt_subscription", model: "available-model", connected: true, permission: true, accountId: "issued-client", accounts: [{ id: "issued-client", email: "person@example.test", connected: true }], models: [{ slug: "available-model", displayName: "Available model" }] } } };
export const Reconnect: Story = { args: { initial: { ...meta.args.initial, provider: "chatgpt_subscription", model: null, error: "reconnect_required" } } };
