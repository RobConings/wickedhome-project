import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantSkillsList } from "@/features/assistant/components/assistant-skills-list";
import { configuredStatus } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/AssistantSkillsList",
  component: AssistantSkillsList,
  decorators: [(Story) => <div className="w-[30rem] max-w-full">{Story()}</div>],
  args: { skills: configuredStatus.skills ?? [] },
} satisfies Meta<typeof AssistantSkillsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every area with its actions, their permission and when they ask. */
export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
