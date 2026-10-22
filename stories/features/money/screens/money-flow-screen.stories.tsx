import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkeletonPage } from "@/components/shared/loading-state";
import { NextToPay } from "@/features/expenses/components/next-to-pay";
import { VoucherBalances } from "@/features/income/components/voucher-balances";
import { MoneyFlowScreen } from "@/features/money/screens/money-flow-screen";
import { expenseFixtures } from "../../expenses/fixtures";
import {
  emptyMoneyMonthFixture,
  moneyHabitants,
  moneyLoansFixture,
  moneyMonthFixture,
  moneyTimelineFixture,
  moneyToday,
  septemberMoneyFixture,
  settlementFixtures,
} from "../fixtures";

const unpaid = Object.values(expenseFixtures)
  .filter((expense) => !expense.paidOn)
  .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

const meta = {
  title: "Features/Money/Screens/MoneyFlowScreen",
  component: MoneyFlowScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: moneyMonthFixture,
    habitants: moneyHabitants,
    canManage: true,
    nextToPay: <NextToPay unpaid={unpaid} habitants={moneyHabitants} today={moneyToday} />,
    vouchers: <VoucherBalances balances={moneyMonthFixture.vouchers} habitants={moneyHabitants} />,
    loans: moneyLoansFixture,
    timeline: moneyTimelineFixture,
  },
} satisfies Meta<typeof MoneyFlowScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** October: contributions half done, joint outgoings, balances, and the projects placeholder. */
export const ThisMonth: Story = {};
/** September, with a correction in the joint account's history ("Correction: … (set to € 5.350,00)"). */
export const MonthWithCorrection: Story = { args: { data: septemberMoneyFixture } };
/** No joint accounts yet: set them up with their balance today. */
export const Setup: Story = { args: { data: emptyMoneyMonthFixture, nextToPay: undefined, vouchers: undefined } };
export const ChildReadOnly: Story = { args: { canManage: false } };
/** The loans and the income/expenses timeline still loading (deferred in the route's loader). */
export const LoansAndTimelineLoading: Story = {
  args: { loans: new Promise<never>(() => undefined), timeline: new Promise<never>(() => undefined) },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
export const Tablet: Story = { globals: { viewport: { value: "tablet" } } };
/** The owner's case: Sofie € 800,00 too much, Rob still € 1.450,00 to go, and the joint costs not covered. */
export const SettlingTheMonth: Story = { args: { data: settlementFixtures.oneOverOneShort } };
export const SettlingTheMonthTablet: Story = { args: { data: settlementFixtures.oneOverOneShort }, globals: { viewport: { value: "tablet" } } };
export const SettlingTheMonthMobile: Story = { args: { data: settlementFixtures.oneOverOneShort }, globals: { viewport: { value: "mobile1" } } };
/** Only the joint account: "Add savings account" is a dashed card in the account row. */
export const NoSavingsAccount: Story = {
  args: { data: { ...settlementFixtures.oneOverOneShort, accounts: settlementFixtures.oneOverOneShort.accounts.filter((account) => account.kind === "joint") } },
};
/** While the route loads: the frame's page skeleton. */
export const Loading: Story = { render: () => <SkeletonPage /> };
