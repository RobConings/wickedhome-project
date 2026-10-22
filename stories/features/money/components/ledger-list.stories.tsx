import type { Meta, StoryObj } from "@storybook/react-vite";
import { LedgerList } from "@/features/money/components/ledger-list";
import { moneyAccounts, moneyHabitants, moneyMonthFixture, septemberMoneyFixture } from "../fixtures";

const september = septemberMoneyFixture.accountMonths.find((month) => month.accountId === "acc-joint");
const october = moneyMonthFixture.accountMonths.find((month) => month.accountId === "acc-joint");

const meta = {
  title: "Features/Money/Components/LedgerList",
  component: LedgerList,
  args: { lines: september?.lines ?? [], accounts: moneyAccounts, habitants: moneyHabitants, canManage: true, storageKey: "story-ledger" },
} satisfies Meta<typeof LedgerList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening balance, contributions, paid joint expenses, a transfer to savings and a correction (marked). */
export const WithCorrections: Story = {};
/** October: a joint income (child benefit) and a paid joint expense, both computed into the balance. */
export const ThisMonth: Story = { args: { lines: october?.lines ?? [] } };
export const ReadOnly: Story = { args: { canManage: false } };
export const Empty: Story = { args: { lines: [] } };
export const Refreshing: Story = { args: { pending: true } };
