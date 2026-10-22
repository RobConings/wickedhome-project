import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@/components/shared/card";
import { IncomeRow } from "@/features/income/components/income-row";
import { incomeAccounts, incomeFixtures, incomeHabitants, incomeSources, incomeToday } from "../fixtures";

const meta = {
  title: "Features/Income/Components/IncomeRow",
  component: IncomeRow,
  args: { income: incomeFixtures.taxReturn, habitants: incomeHabitants, sources: incomeSources, accounts: incomeAccounts, today: incomeToday },
  decorators: [(Story) => <div className="max-w-lg">{Story()}</div>],
} satisfies Meta<typeof IncomeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneOff: Story = {};
/** Joint, landed on the joint account. */
export const ToJointAccount: Story = { args: { income: incomeFixtures.greenCertificates } };
/** Recorded for an occurrence of a recurring income (period shown when it differs from the date). */
export const ForPeriod: Story = { args: { income: incomeFixtures.robVouchersOctober } };
/** Dated after today: still expected, "Expected 30/10/2026", not counted as received. */
export const Upcoming: Story = { args: { income: incomeFixtures.robTaxReturnUpcoming } };
export const Tile: Story = {
  args: { tile: true },
  render: (args) => (
    <Card className="w-56">
      <IncomeRow {...args} />
    </Card>
  ),
};
