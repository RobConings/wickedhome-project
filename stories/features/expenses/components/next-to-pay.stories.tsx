import type { Meta, StoryObj } from "@storybook/react-vite";
import { NextToPay } from "@/features/expenses/components/next-to-pay";
import { expenseHabitants, expensesOverviewFixture, expensesToday } from "../fixtures";

const unpaid = expensesOverviewFixture.expenses.filter((expense) => !expense.paidOn);

const meta = {
  title: "Features/Expenses/Components/NextToPay",
  component: NextToPay,
  decorators: [(Story) => <div className="w-[24rem] max-w-full">{Story()}</div>],
  args: { unpaid, habitants: expenseHabitants, today: expensesToday },
} satisfies Meta<typeof NextToPay>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Next for the joint account and for each person (their own, or their share of a split). */
export const Default: Story = {};
export const OnlyJoint: Story = { args: { unpaid: unpaid.filter((expense) => expense.payerType === "joint") } };
