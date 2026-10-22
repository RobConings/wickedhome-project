import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { LogExpenseDialog } from "@/features/expenses/components/log-expense-dialog";
import { expenseHabitants, expenseShops, expensesToday } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/LogExpenseDialog",
  component: LogExpenseDialog,
  args: {
    habitants: expenseHabitants,
    shops: expenseShops,
    today: expensesToday,
    defaultOpen: true,
    trigger: <Button>Log an expense</Button>,
  },
} satisfies Meta<typeof LogExpenseDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Groceries paid by card from the joint account: amount, shop, save. */
export const Default: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
