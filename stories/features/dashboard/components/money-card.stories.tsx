import type { Meta, StoryObj } from "@storybook/react-vite";
import { LandmarkIcon } from "lucide-react";
import { DashboardCardSkeleton } from "@/features/dashboard/components/dashboard-card-skeleton";
import { MoneyCard } from "@/features/dashboard/components/money-card";
import { moneySummaryFixture, noAccountsMoneySummaryFixture } from "../../money/fixtures";

const meta = {
  title: "Features/Dashboard/Components/MoneyCard",
  component: MoneyCard,
  args: { summary: moneySummaryFixture },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof MoneyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** This month in and out, and the joint balances. */
export const Default: Story = {};
/** No joint accounts set up yet. */
export const NoAccounts: Story = { args: { summary: noAccountsMoneySummaryFixture } };
/** The request failed: only this card shows an error. */
export const Failed: Story = { args: { summary: null } };
export const Loading: Story = { render: () => <DashboardCardSkeleton title="Money this month" icon={LandmarkIcon} tone="success" rows={3} /> };
