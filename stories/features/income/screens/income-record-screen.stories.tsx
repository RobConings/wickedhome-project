import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeRecordScreen } from "@/features/income/screens/income-record-screen";
import { incomeHabitants, incomeOverviewFixture, sourceFixtures, incomeFixtures } from "../fixtures";
const meta = {
  title: "Features/Income/Screens/IncomeRecordScreen", component: IncomeRecordScreen,
  parameters: { layout: "fullscreen" },
  args: { income: incomeFixtures.sofieSalaryOctober, source: sourceFixtures.sofieSalary, overview: incomeOverviewFixture, habitants: incomeHabitants, canManage: true },
} satisfies Meta<typeof IncomeRecordScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Historical: Story = { args: { income: { ...incomeFixtures.sofieSalaryOctober, date: "2018-01-02", periodDate: "2018-01-01" } } };
export const Voucher: Story = { args: { source: sourceFixtures.robVouchers, income: { ...incomeFixtures.sofieSalaryOctober, sourceId: sourceFixtures.robVouchers.id, kind: "meal_vouchers", amountCents: 16000, targetAccountId: null } } };
