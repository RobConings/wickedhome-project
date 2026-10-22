import type { Meta, StoryObj } from "@storybook/react-vite";
import { AskButton } from "@/features/assistant/components/ask-button";
import { fakeAssistantClient, notConfiguredStatus } from "../fixtures";

const meta = {
  title: "Features/Assistant/Components/AskButton",
  component: AskButton,
  decorators: [(Story) => <div className="h-[28rem]">{Story()}</div>],
  args: { client: fakeAssistantClient() },
} satisfies Meta<typeof AskButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The round button in the corner; tap it for a quick chat in a sheet. */
export const Default: Story = {};
export const NotConfigured: Story = { args: { client: fakeAssistantClient({ status: async () => notConfiguredStatus }) } };
/** Opened on a product's page (screen context): the chat offers the product as the question's subject. */
export const OnAProductPage: Story = { args: { open: true, screen: { kind: "product", id: "p1", label: "Tomaten in blik" } } };
export const OnAProductPageMobile: Story = { ...OnAProductPage, globals: { viewport: { value: "mobile1" } } };
