import type { Meta, StoryObj } from "@storybook/react-vite";
import { IncomeOccurrenceList } from "@/features/income/components/income-occurrence-list";
import { incomeAccounts, incomeHabitants, incomeOverviewFixture, incomeToday, septemberIncomeOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Income/Components/IncomeOccurrenceList",
  component: IncomeOccurrenceList,
  args: {
    occurrences: incomeOverviewFixture.occurrences,
    habitants: incomeHabitants,
    accounts: incomeAccounts,
    today: incomeToday,
    canManage: true,
  },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof IncomeOccurrenceList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Variable incomes ask "Enter amount" (one tap opens the amount form); fixed ones are expected until confirmed. */
export const VariableIncomePrompt: Story = {};
export const AllReceived: Story = { args: { occurrences: septemberIncomeOverviewFixture.occurrences } };
export const ReadOnly: Story = { args: { canManage: false } };
export const NothingPlanned: Story = { args: { occurrences: [] } };
