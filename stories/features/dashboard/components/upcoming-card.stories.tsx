import type { Meta, StoryObj } from "@storybook/react-vite";
import { UpcomingCard } from "@/features/dashboard/components/upcoming-card";
import { dashboardFixture, dashboardToday, emptyDashboardFixture } from "../fixtures";

const meta = {
  title: "Features/Dashboard/Components/UpcomingCard",
  component: UpcomingCard,
  decorators: [(Story) => <div className="w-[26rem] max-w-full">{Story()}</div>],
  args: { today: dashboardToday, expenses: dashboardFixture.expenses, tasks: dashboardFixture.tasks },
} satisfies Meta<typeof UpcomingCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NothingComingUp: Story = {
  args: { expenses: emptyDashboardFixture.expenses, tasks: emptyDashboardFixture.tasks },
};
export const ExpensesFailed: Story = { args: { expenses: null } };
export const EverythingFailed: Story = { args: { expenses: null, tasks: null } };
