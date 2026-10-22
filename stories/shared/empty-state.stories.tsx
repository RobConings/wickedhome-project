import type { Meta, StoryObj } from "@storybook/react-vite";
import { InboxIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

const meta = {
  title: "Shared/EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  args: {
    icon: InboxIcon,
    title: "Nothing here yet",
    description: "When you add something, it shows up here.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: {
    action: (
      <Button>
        <PlusIcon />
        Add the first one
      </Button>
    ),
  },
};
