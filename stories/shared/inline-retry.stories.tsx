import type { Meta, StoryObj } from "@storybook/react-vite";
import { InlineRetry, LoadFailedNotice } from "@/components/shared/inline-retry";

const meta = {
  title: "Shared/LoadFailedNotice",
  component: LoadFailedNotice,
  parameters: { layout: "padded" },
  args: {
    message: "The items could not load.",
    onRetry: () => new Promise((resolve) => setTimeout(resolve, 1000)),
  },
} satisfies Meta<typeof LoadFailedNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** The compact variant for panels: the message with a small Retry button under it. */
export const Inline: Story = {
  render: () => <InlineRetry message="The project's tasks could not load." onRetry={() => undefined} />,
};
