import type { Meta, StoryObj } from "@storybook/react-vite";
import { DashboardStats } from "@/features/dashboard/components/dashboard-stats";
import { dashboardFixture, emptyDashboardFixture } from "../fixtures";

const meta = {
  title: "Features/Dashboard/Components/DashboardStats",
  component: DashboardStats,
  parameters: { layout: "padded" },
  args: { tasks: dashboardFixture.tasks, shopping: dashboardFixture.shopping, expenses: dashboardFixture.expenses },
} satisfies Meta<typeof DashboardStats>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NothingToDo: Story = {
  args: { tasks: emptyDashboardFixture.tasks, shopping: emptyDashboardFixture.shopping, expenses: emptyDashboardFixture.expenses },
};
export const FailedToLoad: Story = { args: { tasks: null, shopping: null, expenses: null } };
/** Narrow screens (phones): one tile per row, stacked full width. */
export const Narrow: Story = { decorators: [(Story) => <div className="max-w-sm">{Story()}</div>] };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
