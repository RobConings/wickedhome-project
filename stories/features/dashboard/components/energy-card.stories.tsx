import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyCard } from "@/features/dashboard/components/energy-card";
import { emptySummaryFixture, gasMonthSummaryFixture, gridOnlySummaryFixture, monthSummaryFixture } from "../../energy/fixtures";
import { dashboardFixture, dashboardToday, emptyDashboardFixture } from "../fixtures";

const meta = {
  title: "Features/Dashboard/Components/EnergyCard",
  component: EnergyCard,
  decorators: [(Story) => <div className="w-[24rem] max-w-full">{Story()}</div>],
  args: { today: dashboardToday, summary: dashboardFixture.energy },
} satisfies Meta<typeof EnergyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Electricity (solar measured: how self-sufficient the house is) and gas in kWh and m³. */
export const WithSolarAndGas: Story = {};
/** No gas connection (or no gas data this month): electricity only, without carrier labels. */
export const ElectricityOnly: Story = { args: { summary: { ...monthSummaryFixture, gas: { ...gasMonthSummaryFixture, status: { ...gasMonthSummaryFixture.status, hasGridData: false } } } } };
export const GridOnly: Story = { args: { summary: gridOnlySummaryFixture } };
/** The gas request failed: only the gas part is left out, electricity still shows. */
export const GasFailedToLoad: Story = { args: { summary: { ...monthSummaryFixture, gas: null } } };
/** Gas data but no electricity data yet: gas alone. */
export const GasOnly: Story = { args: { summary: { ...emptySummaryFixture, gas: gasMonthSummaryFixture } } };
export const NoData: Story = { args: { summary: emptyDashboardFixture.energy } };
/** The electricity request failed: the whole card shows the error. */
export const FailedToLoad: Story = { args: { summary: null } };
