import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { conversationFixture, fakeAssistantClient } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/AssistantChat",
  component: AssistantChat,
  decorators: [(Story) => <div className="flex h-[36rem] w-[40rem] max-w-full flex-col">{Story()}</div>],
  args: { conversationId: null, client: fakeAssistantClient() },
} satisfies Meta<typeof AssistantChat>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Working with a fake model: ask anything for a streamed answer; "add bread" asks for a confirmation. */
export const NewChat: Story = {};
/** An earlier conversation, with a confirmation still waiting. */
export const ExistingConversation: Story = { args: { conversationId: "c1", initialMessages: conversationFixture.messages } };
/** The model server is down: the error shows in the thread. */
export const Unreachable: Story = {
  args: {
    client: fakeAssistantClient({
      send: async (_id, _input, onEvent) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        onEvent({ type: "start", conversationId: "x", userMessageId: "q", title: null });
        onEvent({ type: "error", code: "unreachable", message: "The model server could not be reached" });
        onEvent({ type: "done", status: "error" });
      },
    }),
  },
};
/** Server speech on: with "Read answers aloud" on, a spoken question's answer is read sentence by sentence (a chime per sentence here). */
export const ServerVoice: Story = { args: { serverStt: true, serverTts: true } };
