import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantScreen } from "@/features/assistant/screens/assistant-screen";
import { configuredStatus, conversationFixture, conversationsFixture, fakeAssistantClient, never, notConfiguredStatus } from "../fixtures";

const meta = {
  title: "Features/Assistant/Screens/AssistantScreen",
  component: AssistantScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: { status: configuredStatus, conversations: Promise.resolve(conversationsFixture), conversation: null },
    client: fakeAssistantClient(),
  },
} satisfies Meta<typeof AssistantScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new chat with a fake model: try "What's on today?" or "add bread". */
export const NewChat: Story = {};
/** An open conversation with a confirmation waiting. */
export const Conversation: Story = {
  args: { data: { status: configuredStatus, conversations: Promise.resolve(conversationsFixture), conversation: conversationFixture } },
};
/** Not set up yet: the setup card instead of the chat. */
export const NotConfigured: Story = {
  args: { data: { status: notConfiguredStatus, conversations: Promise.resolve([]), conversation: null } },
};
/** The conversation list is still loading. */
export const Loading: Story = {
  args: { data: { status: configuredStatus, conversations: never(), conversation: null } },
};
export const ListFailed: Story = {
  args: { data: { status: configuredStatus, conversations: Promise.resolve(null), conversation: null } },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
