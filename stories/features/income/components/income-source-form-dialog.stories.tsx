import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeSourceFormDialog } from "@/features/income/components/income-source-form-dialog";
import { incomeAccounts, incomeHabitants, incomeToday, sourceFixtures } from "../fixtures";

const meta = {
  title: "Features/Income/Components/IncomeSourceFormDialog",
  component: IncomeSourceFormDialog,
  args: { open: true, habitants: incomeHabitants, accounts: incomeAccounts, today: incomeToday, defaultHabitantId: "h1" },
} satisfies Meta<typeof IncomeSourceFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Add: Story = {};
/** A fixed salary with its amount history ("from 1 Jan: € 2.450"); a new amount applies from a chosen date. */
export const EditFixedWithHistory: Story = { args: { source: sourceFixtures.robSalary } };
/** Variable (meal vouchers): an optional estimate instead of an amount. */
export const EditVariable: Story = { args: { source: sourceFixtures.robVouchers } };
