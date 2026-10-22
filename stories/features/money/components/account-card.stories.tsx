import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountCard } from "@/features/money/components/account-card";
import { accountFixtures, moneyAccounts, moneyHabitants, moneyMonthFixture, moneyToday } from "../fixtures";

const meta = {
  title: "Features/Money/Components/AccountCard",
  component: AccountCard,
  args: {
    account: accountFixtures.joint,
    month: moneyMonthFixture.accountMonths.find((month) => month.accountId === "acc-joint"),
    accounts: moneyAccounts,
    habitants: moneyHabitants,
    today: moneyToday,
    canManage: true,
  },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof AccountCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Balance today, the latest correction, this month in/out, "Set real balance" and "Record transfer". */
export const Joint: Story = {};
export const Savings: Story = {
  args: { account: accountFixtures.savings, month: moneyMonthFixture.accountMonths.find((month) => month.accountId === "acc-savings") },
};
export const Overdrawn: Story = { args: { account: { ...accountFixtures.joint, balanceCents: -12_345 } } };
export const Archived: Story = { args: { account: { ...accountFixtures.savings, archived: true } } };
export const ReadOnly: Story = { args: { canManage: false } };
