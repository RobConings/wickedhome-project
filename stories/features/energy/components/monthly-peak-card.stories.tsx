import type { Meta, StoryObj } from "@storybook/react-vite";
import { MonthlyPeakCard } from "@/features/energy/components/monthly-peak-card";
import { emptySummaryFixture, monthSummaryFixture, yearSummaryFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/MonthlyPeakCard",
  component: MonthlyPeakCard,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { peak: monthSummaryFixture.peak },
} satisfies Meta<typeof MonthlyPeakCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const September: Story = {};
export const WinterPeak: Story = { args: { peak: yearSummaryFixture.peak } };
export const BelowMinimum: Story = {
  args: { peak: { ...monthSummaryFixture.peak, month: "2026-07", kw: 2.3, billedKw: 2.5, at: "2026-07-14T17:45:00.000Z" } },
};
export const NoQuarterHourData: Story = { args: { peak: emptySummaryFixture.peak } };
