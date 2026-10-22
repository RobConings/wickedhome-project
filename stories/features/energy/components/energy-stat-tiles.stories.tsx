import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyStatTiles } from "@/features/energy/components/energy-stat-tiles";
import {
  gasYearSummaryFixture,
  gridOnlySummaryFixture,
  monthSummaryFixture,
  totalYearSummaryFixture,
  yearSummaryFixture,
} from "../fixtures";

const meta = {
  title: "Features/Energy/Components/EnergyStatTiles",
  component: EnergyStatTiles,
  parameters: { layout: "padded" },
  args: { summary: monthSummaryFixture, totalKwp: 6 },
} satisfies Meta<typeof EnergyStatTiles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SolarMeasured: Story = {};
export const Year: Story = { args: { summary: yearSummaryFixture } };
export const SolarNotMeasured: Story = { args: { summary: gridOnlySummaryFixture } };
export const Gas: Story = { args: { summary: gasYearSummaryFixture } };
export const Total: Story = { args: { summary: totalYearSummaryFixture } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
