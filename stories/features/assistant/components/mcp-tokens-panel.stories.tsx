import type { Meta, StoryObj } from "@storybook/react-vite";
import { McpTokensPanel } from "@/features/assistant/components/mcp-tokens-panel";
import { fakeAssistantClient, never, tokensFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/McpTokensPanel",
  component: McpTokensPanel,
  decorators: [(Story) => <div className="w-[36rem] max-w-full">{Story()}</div>],
  args: { client: fakeAssistantClient() },
} satisfies Meta<typeof McpTokensPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Make a token to see it once in a dialog; revoke asks first. */
export const Default: Story = {};
export const Empty: Story = { args: { client: fakeAssistantClient({ listTokens: async () => [] }) } };
export const Loading: Story = { args: { client: fakeAssistantClient({ listTokens: () => never() }) } };
export const FailedToLoad: Story = { args: { client: fakeAssistantClient({ listTokens: async () => Promise.reject(new Error("down")) }) } };
export const Prefilled: Story = { args: { initial: tokensFixture } };
