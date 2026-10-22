import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChatThread } from "@/features/assistant/components/chat-thread";
import { allItemsFixture, noticesFixture, streamingFixture, toolChipsFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/ChatThread",
  component: ChatThread,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: { items: allItemsFixture, busy: false, onDecide: fn(), onSuggestion: fn() },
} satisfies Meta<typeof ChatThread>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An answer, a tool chip, and a sensitive action waiting for confirmation. */
export const WithConfirmation: Story = {};
/** The answer arrives word by word. */
export const Streaming: Story = { args: { items: streamingFixture, busy: true } };
/** Waiting for the first words. */
export const Thinking: Story = { args: { items: [{ kind: "user", key: "1", text: "What's on today?" }], busy: true } };
/** Done, failed (with why), cancelled and running chips. */
export const ToolChips: Story = { args: { items: toolChipsFixture } };
/** A model without tool support, and an unreachable server. */
export const NoticesAndErrors: Story = { args: { items: noticesFixture } };
/** A new chat: suggestions to tap. */
export const Empty: Story = { args: { items: [] } };
