import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonPage } from "../../../../src/features/expenses/components/loading-state";
import { ExpensesScreen } from "@/features/expenses/screens/expenses-screen";
import { emptyExpensesOverviewFixture, expenseHabitants, expenseShops, expensesOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Expenses/Screens/ExpensesScreen",
  component: ExpensesScreen,
  parameters: { layout: "fullscreen" },
  args: {
    overview: expensesOverviewFixture,
    habitants: expenseHabitants,
    shops: expenseShops,
    canManage: true,
    currentHabitantId: "h1",
  },
} satisfies Meta<typeof ExpensesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Upcoming: unpaid soonest first (overdue highlighted), next for the joint account and per person. */
export const Upcoming: Story = {};
export const UpcomingJoint: Story = { parameters: { router: { initialEntries: ["/expenses?payer=joint"] } } };
export const UpcomingForRob: Story = { parameters: { router: { initialEntries: ["/expenses?payer=h1"] } } };
/** Recurring: everything running, with its monthly and yearly cost and a quick pause. */
export const Recurring: Story = { parameters: { router: { initialEntries: ["/expenses?view=recurring"] } } };
export const RecurringLoansOnly: Story = { parameters: { router: { initialEntries: ["/expenses?view=recurring&kind=loan"] } } };
export const RecurringEnded: Story = { parameters: { router: { initialEntries: ["/expenses?view=recurring&status=ended"] } } };
export const History: Story = { parameters: { router: { initialEntries: ["/expenses?view=history"] } } };
export const OnHold: Story = { args: { onHoldById: { "e-hendrickx": "Waiting for the corrected invoice" } } };
/** From the dashboard's quick action: the expense form opens and `?new=1` is removed. */
export const NewFromDashboard: Story = { parameters: { router: { initialEntries: ["/expenses?new=1"] } } };
export const ChildReadOnly: Story = { args: { canManage: false, currentHabitantId: "h3" } };
export const Empty: Story = { args: { overview: emptyExpensesOverviewFixture } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
/** While the route loads: the frame's page skeleton. */
export const Loading: Story = { render: () => <SkeletonPage /> };
