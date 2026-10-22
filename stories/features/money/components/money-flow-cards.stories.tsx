import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContributionsCard } from "@/features/money/components/contributions-card";
import { IncomeFlowCard } from "@/features/money/components/income-flow-card";
import { JointOutgoingsCard } from "@/features/money/components/joint-outgoings-card";
import { emptyMoneyMonthFixture, moneyAccounts, moneyHabitants, moneyMonthFixture, moneyToday, planFixtures } from "../fixtures";

/** The money flow's month cards: contributions (planned vs recorded), income in, joint outgoings. */
const meta = {
  title: "Features/Money/Components/MonthCards",
  component: ContributionsCard,
  args: {
    rows: moneyMonthFixture.contributions,
    plans: planFixtures,
    accounts: moneyAccounts,
    habitants: moneyHabitants,
    month: moneyMonthFixture.month,
    today: moneyToday,
    canManage: true,
  },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof ContributionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rob has transferred, Sofie not yet: "Record" is prefilled with what is still to go. */
export const ContributionsPlannedVsRecorded: Story = {};
export const NoContributions: Story = { args: { rows: [], plans: [] } };
export const IncomeIn: Story = {
  render: () => <IncomeFlowCard income={moneyMonthFixture.income} habitants={moneyHabitants} month={moneyMonthFixture.month} />,
};
export const IncomeNone: Story = {
  render: () => <IncomeFlowCard income={emptyMoneyMonthFixture.income} habitants={moneyHabitants} month={moneyMonthFixture.month} />,
};
export const JointOutgoings: Story = { render: () => <JointOutgoingsCard outgoings={moneyMonthFixture.jointOutgoings} today={moneyToday} /> };
export const JointOutgoingsNone: Story = { render: () => <JointOutgoingsCard outgoings={emptyMoneyMonthFixture.jointOutgoings} today={moneyToday} /> };
