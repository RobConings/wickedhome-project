import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonPage } from "../../../../src/features/income/components/loading-state";
import { IncomeScreen } from "@/features/income/screens/income-screen";
import { emptyIncomeOverviewFixture, incomeHabitants, incomeOverviewFixture, septemberIncomeOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Income/Screens/IncomeScreen",
  component: IncomeScreen,
  parameters: { layout: "fullscreen" },
  args: { overview: incomeOverviewFixture, habitants: incomeHabitants, canManage: true, currentHabitantId: "h1" },
} satisfies Meta<typeof IncomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** October: Sofie's salary is in, Rob's expected, Sofie's meal vouchers still to enter. */
export const ThisMonth: Story = {};
/** A past month: everything recorded. */
export const September: Story = { args: { overview: septemberIncomeOverviewFixture } };
/** From the dashboard's "Record income": the one-off form opens and `?new=1` is removed. */
export const RecordFromDashboard: Story = { parameters: { router: { initialEntries: ["/income?new=1"] } } };
export const ChildReadOnly: Story = { args: { canManage: false, currentHabitantId: "h3" } };
export const Empty: Story = { args: { overview: emptyIncomeOverviewFixture } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
/** While the route loads: the frame's page skeleton. */
export const Loading: Story = { render: () => <SkeletonPage /> };
