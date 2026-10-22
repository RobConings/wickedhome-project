import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoansCard } from "@/features/money/components/loans-card";
import { MoneyTimelineCard } from "@/features/money/components/money-timeline-card";
import { emptyMoneyLoansFixture, emptyMoneyTimelineFixture, moneyLoansFixture, moneyTimelineFixture } from "../fixtures";

/**
 * Money flow: loans and down payments with what is still open, and income and expenses per month, past and
 * future (the expenses step down when the house loan and the down payment end in February 2027).
 */
const meta = {
  title: "Features/Money/Components/LoansAndTimeline",
  component: LoansCard,
  args: { data: moneyLoansFixture },
  decorators: [(Story) => <div className="max-w-3xl">{Story()}</div>],
} satisfies Meta<typeof LoansCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Still open, repaid and per month; per loan what is left, its progress and last payment. */
export const Loans: Story = {};
export const LoansNone: Story = { args: { data: emptyMoneyLoansFixture } };
export const LoansLoading: Story = { args: { data: new Promise<never>(() => undefined) } };
export const LoansFailed: Story = { args: { data: null } };
export const LoansMobile: Story = { globals: { viewport: { value: "mobile1" } } };

/** 12 months back, 12 ahead (switch to 6 or 24): bars in and out, the net line, "now" and the projected part. */
export const Timeline: Story = { render: () => <MoneyTimelineCard data={moneyTimelineFixture} /> };
/** On a phone the months scroll sideways, starting at "now". */
export const TimelineMobile: Story = {
  globals: { viewport: { value: "mobile1" } },
  render: () => <MoneyTimelineCard data={moneyTimelineFixture} />,
};
export const TimelineEmpty: Story = { render: () => <MoneyTimelineCard data={emptyMoneyTimelineFixture} /> };
export const TimelineLoading: Story = { render: () => <MoneyTimelineCard data={new Promise<never>(() => undefined)} /> };
export const TimelineFailed: Story = { render: () => <MoneyTimelineCard data={null} /> };
