import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonPage } from "../../../../src/features/expenses/components/loading-state";
import { RecurringExpenseDetailScreen } from "@/features/expenses/screens/recurring-expense-detail-screen";
import { expenseHabitants, expenseShops, recurringExpenseDetailFixture, recurringFixtures, recurringLoanDetailFixture } from "../fixtures";

const meta = {
  title: "Features/Expenses/Screens/RecurringExpenseDetailScreen",
  component: RecurringExpenseDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { detail: recurringExpenseDetailFixture, habitants: expenseHabitants, shops: expenseShops, canManage: true },
} satisfies Meta<typeof RecurringExpenseDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A down payment by transfer: upcoming instances, history and the next payment's QR. */
export const DownPayment: Story = {};
/** A loan with a total still open: € 4.027,81 of € 10.000,00 left, 5 payments to go, the last one partial. */
export const LoanWithTotalOpen: Story = { args: { detail: recurringLoanDetailFixture } };
/** A down payment with a total open amount, nothing paid yet (4 × € 230,00 + last € 80,00). */
export const DownPaymentWithTotalOpen: Story = {
  args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.brackevaWithTotal } },
};
export const Paused: Story = {
  args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.insurance, upcoming: [] } },
};
export const Ended: Story = { args: { detail: { ...recurringExpenseDetailFixture, recurring: recurringFixtures.gym, upcoming: [] } } };
export const ReadOnly: Story = { args: { canManage: false } };
export const Loading: Story = { render: () => <SkeletonPage /> };
