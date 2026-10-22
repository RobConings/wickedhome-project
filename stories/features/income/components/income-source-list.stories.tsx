import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeSourceList } from "@/features/income/components/income-source-list";
import { incomeAccounts, incomeHabitants, incomeSources, incomeToday } from "../fixtures";

const meta = {
  title: "Features/Income/Components/IncomeSourceList",
  component: IncomeSourceList,
  args: { sources: incomeSources, habitants: incomeHabitants, accounts: incomeAccounts, today: incomeToday, canManage: true },
} satisfies Meta<typeof IncomeSourceList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recurring incomes per member (joint last): current amount since when, schedule and target account. */
export const Default: Story = {};
export const ReadOnly: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
