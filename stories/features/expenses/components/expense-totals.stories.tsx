import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseTotals, RecurringTotals } from "@/features/expenses/components/expense-totals";
import { emptyExpensesOverviewFixture, expensesOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/ExpenseTotals",
  component: ExpenseTotals,
  parameters: { layout: "padded" },
  args: { totals: expensesOverviewFixture.totals },
} satisfies Meta<typeof ExpenseTotals>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { totals: emptyExpensesOverviewFixture.totals } };
/** What everything recurring costs per month and year, and what cancelling the flagged ones saves. */
export const Recurring: Story = { render: () => <RecurringTotals totals={expensesOverviewFixture.recurringTotals} /> };
