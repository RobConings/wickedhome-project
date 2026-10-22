import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConversationList } from "@/features/assistant/components/conversation-list";
import { conversationsFixture } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/ConversationList",
  component: ConversationList,
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
  args: { conversations: conversationsFixture, activeId: "c1", onRename: fn(async () => undefined), onDelete: fn(async () => undefined) },
} satisfies Meta<typeof ConversationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { conversations: [], activeId: null } };
