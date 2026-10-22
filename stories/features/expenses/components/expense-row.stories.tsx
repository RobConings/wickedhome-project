import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpenseRow } from "@/features/expenses/components/expense-row";
import { expenseFixtures, expenseHabitants, expensesToday } from "../fixtures";

const meta = {
  title: "Features/Expenses/Components/ExpenseRow",
  component: ExpenseRow,
  decorators: [(Story) => <ul className="w-[36rem] max-w-full">{Story()}</ul>],
  args: { expense: expenseFixtures.watergroep, today: expensesToday, habitants: expenseHabitants, canManage: true },
} satisfies Meta<typeof ExpenseRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DueSoon: Story = {};
/** The Upcoming/History list's tiles view (`variant="tile"`). */
export const Tile: Story = {
  args: { expense: expenseFixtures.verisure, onHold: "Waiting for the corrected invoice", variant: "tile" },
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
};
export const OverdueOnePerson: Story = { args: { expense: expenseFixtures.hendrickx } };
export const SplitDirectDebit: Story = { args: { expense: expenseFixtures.verisure } };
export const AutoPaid: Story = { args: { expense: expenseFixtures.luminusPaid } };
export const OnHold: Story = { args: { onHold: "Waiting for the corrected invoice" } };
export const ReadOnly: Story = { args: { canManage: false } };
