import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyFlowChart } from "@/features/energy/components/energy-flow-chart";
import {
  daySummaryFixture,
  gasDaySummaryFixture,
  gasYearSummaryFixture,
  gridOnlySummaryFixture,
  monthSummaryFixture,
  totalYearSummaryFixture,
  weekSummaryFixture,
  yearSummaryFixture,
} from "../fixtures";

const meta = {
  title: "Features/Energy/Components/EnergyFlowChart",
  component: EnergyFlowChart,
  decorators: [(Story) => <div className="w-[44rem] max-w-full">{Story()}</div>],
  args: { summary: monthSummaryFixture },
} satisfies Meta<typeof EnergyFlowChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const Day: Story = { args: { summary: daySummaryFixture } };
export const Week: Story = { args: { summary: weekSummaryFixture } };
export const Year: Story = { args: { summary: yearSummaryFixture } };
export const GridOnly: Story = { args: { summary: gridOnlySummaryFixture } };
export const GasYear: Story = { args: { summary: gasYearSummaryFixture } };
export const GasDay: Story = { args: { summary: gasDaySummaryFixture } };
export const TotalYear: Story = { args: { summary: totalYearSummaryFixture } };
