import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecurringExpenseRow } from "@/features/expenses/components/recurring-expense-row";
import { expenseHabitants, expensesToday, recurringFixtures } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/RecurringExpenseRow",
  component: RecurringExpenseRow,
  decorators: [(Story) => <ul className="w-[40rem] max-w-full">{Story()}</ul>],
  args: { recurring: recurringFixtures.loan, today: expensesToday, habitants: expenseHabitants, canManage: true },
} satisfies Meta<typeof RecurringExpenseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loan: Story = {};
/** The Recurring list's tiles view (`variant="tile"`). */
export const Tile: Story = {
  args: { recurring: recurringFixtures.houseLoan, variant: "tile" },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
};
export const DownPaymentWithReminder: Story = { args: { recurring: recurringFixtures.brackeva, today: "2026-10-24" } };
export const SubscriptionToCancel: Story = { args: { recurring: recurringFixtures.netflix } };
export const Paused: Story = { args: { recurring: recurringFixtures.insurance } };
export const Ended: Story = { args: { recurring: recurringFixtures.gym } };
/** A loan with a total still open: remaining, progress, payments to go and the last payment's date. */
export const LoanWithTotalOpen: Story = { args: { recurring: recurringFixtures.houseLoan } };
export const DownPaymentWithTotalOpen: Story = { args: { recurring: recurringFixtures.brackevaWithTotal } };
/** Narrow (phone): the progress line wraps under the row. */
export const LoanWithTotalOpenMobile: Story = {
  args: { recurring: recurringFixtures.houseLoan },
  decorators: [(Story) => <ul className="w-[22rem]">{Story()}</ul>],
};
