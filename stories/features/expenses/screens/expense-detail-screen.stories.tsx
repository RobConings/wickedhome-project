import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonPage } from "@/components/shared/loading-state";
import { ExpenseDetailScreen } from "@/features/expenses/screens/expense-detail-screen";
import { expenseDetailFixture, expenseFixtures, expenseHabitants, expenseShops, recurringFixtures } from "../fixtures";

const meta = {
  title: "Features/Expenses/Screens/ExpenseDetailScreen",
  component: ExpenseDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { detail: expenseDetailFixture, habitants: expenseHabitants, shops: expenseShops, canManage: true, currentHabitantId: "h1" },
} satisfies Meta<typeof ExpenseDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A wire transfer with a structured communication: the payment QR and copy buttons. */
export const WithPaymentQr: Story = {};
export const SplitDirectDebit: Story = { args: { detail: { ...expenseDetailFixture, expense: expenseFixtures.verisure } } };
export const AutoPaidInstance: Story = {
  args: {
    detail: {
      ...expenseDetailFixture,
      expense: expenseFixtures.luminusPaid,
      recurring: recurringFixtures.luminus,
      history: [expenseFixtures.luminusPaid],
    },
  },
};
export const LoggedAtShop: Story = { args: { detail: { ...expenseDetailFixture, expense: expenseFixtures.groceries } } };
export const OnHold: Story = {
  args: { onHold: "Waiting for the corrected invoice", linkedTask: <div className="rounded-xl border p-4 text-sm">Linked pay task (composed in by the route)</div> },
};
export const ReadOnly: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
export const Loading: Story = { render: () => <SkeletonPage /> };
