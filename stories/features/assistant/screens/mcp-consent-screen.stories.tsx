import type { Meta, StoryObj } from "@storybook/react-vite";
import { McpConsentScreen } from "@/features/assistant/screens/mcp-consent-screen";
import { adultUserFixture, sessionUserFixture } from "../../auth/fixtures";
import { consentFixture, fakeMcpOAuthClient } from "../fixtures";

const meta = {
  title: "Features/Assistant/Screens/McpConsentScreen",
  component: McpConsentScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: { user: sessionUserFixture, requestId: "r1", consent: consentFixture },
    client: fakeMcpOAuthClient(),
    navigate: () => undefined,
  },
} satisfies Meta<typeof McpConsentScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ChatGPT asks for read and write: the redirect domain prominently, a choice of access, Allow / Deny. */
export const ReadOrWrite: Story = {};
/** The client asked for read only: no write option. */
export const ReadOnly: Story = { args: { data: { user: adultUserFixture, requestId: "r1", consent: { ...consentFixture, requestedScopes: ["read"] } } } };
/** A manual OAuth app with a long name and its own domain. */
export const ManualApp: Story = {
  args: { data: { user: sessionUserFixture, requestId: "r1", consent: { ...consentFixture, kind: "manual", clientName: "My home agent with a rather long name", redirectHost: "agent.example.com" } } },
};
/** Children are refused outright. */
export const Child: Story = {
  args: { data: { user: { ...adultUserFixture, role: "child", name: "Kid" }, requestId: "r1", consent: { ...consentFixture, refused: "child" } } },
};
/** Expired or unknown request. */
export const Expired: Story = { args: { data: { user: sessionUserFixture, requestId: "r1", consent: null } } };
/** The decision fails (e.g. the page sat open too long). */
export const DecisionFails: Story = { args: { client: fakeMcpOAuthClient({ decide: async () => Promise.reject(new Error("expired")) }) } };
