import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeMonthTotalsTiles } from "@/features/income/components/income-month-totals";
import { emptyIncomeOverviewFixture, incomeHabitants, incomeOverviewFixture, septemberIncomeOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Income/Components/IncomeMonthTotals",
  component: IncomeMonthTotalsTiles,
  args: { totals: incomeOverviewFixture.totals, habitants: incomeHabitants },
} satisfies Meta<typeof IncomeMonthTotalsTiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Household and per person: received plus still expected; meal vouchers apart. */
export const ThisMonth: Story = {};
export const September: Story = { args: { totals: septemberIncomeOverviewFixture.totals } };
export const Nothing: Story = { args: { totals: emptyIncomeOverviewFixture.totals } };
