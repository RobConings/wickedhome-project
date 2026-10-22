import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeFormDialog } from "@/features/income/components/income-form-dialog";
import { incomeAccounts, incomeFixtures, incomeHabitants, incomeOverviewFixture, incomeToday } from "../fixtures";

const toEnter = incomeOverviewFixture.occurrences.find((occurrence) => occurrence.status === "to_enter");

const meta = {
  title: "Features/Income/Components/IncomeFormDialog",
  component: IncomeFormDialog,
  args: { open: true, habitants: incomeHabitants, accounts: incomeAccounts, today: incomeToday, defaultHabitantId: "h1" },
} satisfies Meta<typeof IncomeFormDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A one-off income: tax return, green certificates, gift… per person or joint. */
export const OneOff: Story = {};
/** "Enter this month's amount" of a variable recurring income (meal vouchers). */
export const EnterVariableAmount: Story = { args: { occurrence: toEnter } };
export const EditIncome: Story = { args: { income: incomeFixtures.taxReturn } };
export const WithoutJointAccounts: Story = { args: { accounts: [] } };
