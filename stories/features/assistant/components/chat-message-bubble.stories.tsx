import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatMessageBubble } from "@/features/assistant/components/chat-message-bubble";

const meta = {
  title: "Features/Assistant/Components/ChatMessageBubble",
  component: ChatMessageBubble,
  decorators: [(Story) => <div className="w-[32rem] max-w-full">{Story()}</div>],
  args: { role: "assistant", text: "Tonight **PMD** and paper go out.\nThe electricity bill (€ 84,20) is due on Tuesday." },
} satisfies Meta<typeof ChatMessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Answer: Story = {};
export const Question: Story = { args: { role: "user", text: "Which bin goes out tonight?" } };
export const Streaming: Story = { args: { text: "Tonight **PMD** and", streaming: true } };
/** Asked from a page (screen context): the page's label above the question. */
export const QuestionAboutScreen: Story = { args: { role: "user", text: "Add this to the shopping list", screen: "Tomaten in blik" } };
