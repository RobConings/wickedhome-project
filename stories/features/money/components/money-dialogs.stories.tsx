import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountFormDialog } from "@/features/money/components/account-form-dialog";
import { ContributionPlanDialog } from "@/features/money/components/contribution-plan-dialog";
import { OtherEntryDialog } from "@/features/money/components/other-entry-dialog";
import { RecordTransferDialog } from "@/features/money/components/record-transfer-dialog";
import { SetBalanceDialog } from "@/features/money/components/set-balance-dialog";
import { accountFixtures, moneyAccounts, moneyHabitants, moneyToday, planFixtures } from "../fixtures";

/** The money flow's dialogs: record transfer, set real balance, accounts, contribution plans, other in/out. */
const meta = {
  title: "Features/Money/Components/Dialogs",
  component: RecordTransferDialog,
  args: { open: true, accounts: moneyAccounts, habitants: moneyHabitants, today: moneyToday },
} satisfies Meta<typeof RecordTransferDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Record transfer", prefilled from Sofie's contribution plan (what is still to go, the planned day). */
export const RecordTransfer: Story = { args: { defaults: { from: "habitant:h2", toAccountId: "acc-joint", amountCents: 150_000, date: "2026-10-03" } } };
/** Joint → savings. */
export const TransferToSavings: Story = { args: { defaults: { from: "account:acc-joint", toAccountId: "acc-savings" } } };
/** "Set real balance": the difference is recorded as a correction. */
export const SetBalance: Story = { render: () => <SetBalanceDialog open account={accountFixtures.joint} today={moneyToday} /> };
export const AddAccount: Story = { render: () => <AccountFormDialog open habitants={moneyHabitants} today={moneyToday} defaultKind="savings" /> };
export const EditAccount: Story = { render: () => <AccountFormDialog open habitants={moneyHabitants} today={moneyToday} account={accountFixtures.joint} /> };
export const ContributionPlan: Story = {
  render: () => <ContributionPlanDialog open accounts={moneyAccounts} habitants={moneyHabitants} monthStart="2026-10-01" plan={planFixtures[0]} />,
};
export const OtherInOut: Story = { render: () => <OtherEntryDialog open account={accountFixtures.savings} today={moneyToday} /> };
