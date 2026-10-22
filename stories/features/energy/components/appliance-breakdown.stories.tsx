import type { Meta, StoryObj } from "@storybook/react-vite";
import { ApplianceBreakdown } from "@/features/energy/components/appliance-breakdown";
import { gridOnlySummaryFixture, monthSummaryFixture, nothingMeasuredSummaryFixture, emptySummaryFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/ApplianceBreakdown",
  component: ApplianceBreakdown,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { breakdown: monthSummaryFixture.breakdown },
} satisfies Meta<typeof ApplianceBreakdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithMeasuredAppliances: Story = {};
export const NothingMeasured: Story = { args: { breakdown: nothingMeasuredSummaryFixture.breakdown } };
export const ConsumptionUnknown: Story = {
  args: {
    breakdown: {
      ...gridOnlySummaryFixture.breakdown,
      appliances: monthSummaryFixture.breakdown.appliances,
    },
  },
};
export const NoData: Story = { args: { breakdown: emptySummaryFixture.breakdown } };
