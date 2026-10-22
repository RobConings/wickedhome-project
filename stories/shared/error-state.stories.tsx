import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";

const meta = {
  title: "Shared/ErrorState",
  component: ErrorState,
  args: {
    title: "This page ran into a problem",
    description: "Try again. If it keeps happening, check the logs.",
    action: <Button>Try again</Button>,
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
