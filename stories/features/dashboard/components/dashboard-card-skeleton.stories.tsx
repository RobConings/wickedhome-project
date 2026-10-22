import type { Meta, StoryObj } from "@storybook/react-vite";
import { ZapIcon } from "lucide-react";
import { DashboardCardSkeleton } from "@/features/dashboard/components/dashboard-card-skeleton";

const meta = {
  title: "Features/Dashboard/Components/DashboardCardSkeleton",
  component: DashboardCardSkeleton,
  decorators: [(Story) => <div className="w-[24rem] max-w-full">{Story()}</div>],
  args: { title: "Today", rows: 4 },
} satisfies Meta<typeof DashboardCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithIcon: Story = { args: { title: "Energy", icon: ZapIcon, tone: "highlight", rows: 2 } };
