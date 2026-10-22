import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageGrid } from "../../../../src/features/money/components/page-grid";
import { AddAccountCard } from "@/features/money/components/add-account-card";
import { ContributionsCard } from "@/features/money/components/contributions-card";
import { CoverageCard } from "@/features/money/components/coverage-card";
import { TakeBackDialog } from "@/features/money/components/take-back-dialog";
import type { MoneyMonth } from "@/features/money/types/money";
import { moneyHabitants, moneyToday, settlementFixtures } from "../fixtures";

/**
 * Settling the month's contributions: per person planned vs transferred and the result, what still needs to
 * happen (with the netting alternative and the end result), and the coverage check next to it.
 */
const meta = {
  title: "Features/Money/Components/ContributionSettlement",
  component: ContributionsCard,
  args: {
    rows: settlementFixtures.oneOverOneShort.contributions,
    plans: settlementFixtures.oneOverOneShort.plans,
    accounts: settlementFixtures.oneOverOneShort.accounts,
    habitants: moneyHabitants,
    month: settlementFixtures.oneOverOneShort.month,
    today: moneyToday,
    canManage: true,
  },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof ContributionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const argsFor = (data: MoneyMonth) => ({ rows: data.contributions, plans: data.plans, accounts: data.accounts, month: data.month });

/** Sofie € 800,00 too much, Rob still € 1.450,00 to transfer: what to do, the netting alternative, the end result. */
export const OneOverOneShort: Story = {};
export const EveryoneDone: Story = { args: argsFor(settlementFixtures.everyoneDone) };
export const BothShort: Story = { args: argsFor(settlementFixtures.bothShort) };
/** After "Take back" of € 800,00: Sofie is done (net € 1.200,00), the history shows "taken back". */
export const AfterTakeBack: Story = { args: argsFor(settlementFixtures.afterTakeBack) };
/** Sofie's surplus kept as extra: no longer flagged, with "Undo". */
export const KeptAsExtra: Story = { args: argsFor(settlementFixtures.keptExtra) };
export const ReadOnly: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

/** The take back flow: prefilled with the over-contribution, dated today. */
export const TakeBackFlow: Story = {
  render: () => (
    <TakeBackDialog open habitantId="h2" personName="Sofie" accountId="acc-joint" accountName="Gezamenlijke rekening" amountCents={80_000} today={moneyToday} />
  ),
};

const coverage = (data: MoneyMonth) => (
  <CoverageCard
    rows={data.contributions}
    accounts={data.accounts}
    costs={data.jointCosts}
    income={data.income.people}
    habitants={moneyHabitants}
    month={data.month}
    today={moneyToday}
    canManage
  />
);

/** Short by € 1.323,88: the projected end-of-month balance and new plan amounts (same split, or by income). */
export const CoverageShort: Story = { render: () => coverage(settlementFixtures.oneOverOneShort) };
export const CoverageCovered: Story = { render: () => coverage(settlementFixtures.covered) };
export const CoverageLeftOver: Story = { render: () => coverage(settlementFixtures.everyoneDone) };
/** The joint account would go below zero on 5 Oct, before the contributions come in. */
export const CoverageBelowZeroWarning: Story = { render: () => coverage(settlementFixtures.belowZero) };

/** The contributions card wide next to the coverage card, as on the page. */
export const SideBySide: Story = {
  decorators: [(Story) => <div className="max-w-6xl">{Story()}</div>],
  render: (args) => (
    <PageGrid columns="main-sidebar" className="items-start">
      <ContributionsCard {...args} />
      {coverage(settlementFixtures.oneOverOneShort)}
    </PageGrid>
  ),
};

/** The dashed placeholder in the account row when there is no savings account yet. */
export const AddSavingsPlaceholder: Story = {
  render: () => (
    <div className="max-w-sm">
      <AddAccountCard kind="savings" habitants={moneyHabitants} today={moneyToday} />
    </div>
  ),
};
