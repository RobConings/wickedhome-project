import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/features/expenses/components/category-select";
import { ExpenseCategoryIcon } from "@/features/expenses/components/expense-category-icon";
import { ExpenseStatusBadge, RecurringStatusBadge } from "@/features/expenses/components/expense-status-badge";
import { MarkExpensePaidDialog } from "@/features/expenses/components/mark-expense-paid-dialog";
import { PayeeField } from "@/features/expenses/components/payee-field";
import { PayerBadge } from "@/features/expenses/components/payer-badge";
import { RecurringExtraFields } from "@/features/expenses/components/recurring-extra-fields";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, RECURRING_STATUSES } from "@/features/expenses/types/expenses";
import { expenseFixtures, expenseHabitants, expensesToday, payeeFixtures, recurringFixtures } from "../fixtures";

/** The small building blocks of the expenses feature, one story each. */
const meta = {
  title: "Features/Expenses/Components/Parts",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CategoryIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {EXPENSE_CATEGORIES.map((category) => (
        <ExpenseCategoryIcon key={category} category={category} />
      ))}
    </div>
  ),
};

export const CategoryPicker: Story = {
  render: () => <CategorySelect id="category" value="groceries" onChange={() => undefined} first="everyday" />,
};

export const StatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {EXPENSE_STATUSES.map((status) => (
        <ExpenseStatusBadge key={status} status={status} />
      ))}
      {RECURRING_STATUSES.map((status) => (
        <RecurringStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};

export const PayerBadges: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <PayerBadge payer={expenseFixtures.watergroep} habitants={expenseHabitants} />
      <PayerBadge payer={expenseFixtures.hendrickx} habitants={expenseHabitants} />
      <PayerBadge payer={expenseFixtures.verisure} habitants={expenseHabitants} />
    </div>
  ),
};

export const Payee: Story = {
  render: () => (
    <div className="w-80">
      <PayeeField id="payee" payees={payeeFixtures} defaultValue="Fluvius" />
    </div>
  ),
};

export const RecurringFields: Story = {
  render: () => (
    <div className="flex w-[28rem] flex-col gap-4">
      <RecurringExtraFields recurring={recurringFixtures.netflix} />
    </div>
  ),
};

export const MarkPaid: Story = {
  render: () => (
    <MarkExpensePaidDialog
      expense={expenseFixtures.watergroep}
      habitants={expenseHabitants}
      today={expensesToday}
      defaultPaidById="h1"
      trigger={<Button>Mark as paid</Button>}
    />
  ),
};
