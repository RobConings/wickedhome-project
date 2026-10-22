import type { Meta, StoryObj } from "@storybook/react-vite";
import { McpConnectionsPanel } from "@/features/assistant/components/mcp-connections-panel";
import { fakeAssistantClient, fakeMcpOAuthClient, never, oauthAdultOverviewFixture, oauthOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/McpConnectionsPanel",
  component: McpConnectionsPanel,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { client: fakeAssistantClient(), oauthClient: fakeMcpOAuthClient() },
} satisfies Meta<typeof McpConnectionsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The three ways side by side; the personal token panel (unchanged) first, connected apps below. */
export const PersonalToken: Story = {};
/** Automatic registration (ChatGPT/Claude connectors): instructions, and for owners the switch and domains. */
export const OAuthAutomatic: Story = { args: { defaultMethod: "dcr" } };
export const OAuthAutomaticOff: Story = {
  args: { defaultMethod: "dcr", initial: { ...oauthOverviewFixture, settings: { dcrEnabled: false, allowedHosts: [] } } },
};
/** Manual OAuth apps: "New OAuth app" shows the client ID and secret once (the story's action returns one). */
export const OAuthApps: Story = {
  args: { defaultMethod: "app" },
  parameters: {
    router: {
      action: async () => ({
        ok: true,
        app: { ...oauthOverviewFixture.apps![0]!, id: "a2", name: "ChatGPT", clientId: "wh_client_N4pQ8sV1xZ6cR2tW", clientSecret: "wh_cs_9fK2mQ7xL4vB8nR1tY6pZ3cW5hJ0dS2aE8uG4iO7" },
      }),
    },
  },
};
/** An adult: their own connections only; settings and apps are the owner's. */
export const Adult: Story = { args: { defaultMethod: "dcr", oauthClient: fakeMcpOAuthClient({ overview: async () => oauthAdultOverviewFixture }) } };
export const NothingConnected: Story = { args: { defaultMethod: "dcr", initial: { ...oauthOverviewFixture, connected: [], apps: [] } } };
export const Loading: Story = { args: { defaultMethod: "dcr", oauthClient: fakeMcpOAuthClient({ overview: () => never() }) } };
export const FailedToLoad: Story = { args: { defaultMethod: "app", oauthClient: fakeMcpOAuthClient({ overview: async () => Promise.reject(new Error("down")) }) } };
