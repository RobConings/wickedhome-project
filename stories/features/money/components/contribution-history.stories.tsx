import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContributionHistory } from "@/features/money/components/contribution-history";
import { contributionHistoryFixture, moneyAccounts, moneyHabitants, moneyToday, planFixtures } from "../fixtures";

const meta = {
  title: "Features/Money/Components/ContributionHistory",
  component: ContributionHistory,
  args: { data: contributionHistoryFixture, accounts: moneyAccounts, habitants: moneyHabitants, plans: planFixtures },
} satisfies Meta<typeof ContributionHistory>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { data: { today: moneyToday, rows: [] } } };
export const WithdrawalsAndFormerMember: Story = {
  args: { data: { today: moneyToday, rows: [
    ...contributionHistoryFixture.rows,
    { month: "2026-10", accountId: "acc-joint", habitantId: "h2", amountCents: -20_000 },
    { month: "2025-12", accountId: "acc-joint", habitantId: null, amountCents: 100_000 },
  ] } },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
