import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseList } from "@/features/expenses/components/expense-list";
import { expenseHabitants, expenseShops, expensesOverviewFixture, expensesToday } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/ExpenseList",
  component: ExpenseList,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: {
    expenses: expensesOverviewFixture.expenses,
    today: expensesToday,
    habitants: expenseHabitants,
    shops: expenseShops,
    canManage: true,
  },
} satisfies Meta<typeof ExpenseList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped per month with a total; a logged expense at a shop shows the shop's logo. */
export const Default: Story = {};
export const FirstMonthOnly: Story = { args: { initialMonths: 1 } };
