import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComingSoonCard } from "@/features/dashboard/components/coming-soon-card";

const meta = {
  title: "Features/Dashboard/Components/ComingSoonCard",
  component: ComingSoonCard,
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof ComingSoonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
