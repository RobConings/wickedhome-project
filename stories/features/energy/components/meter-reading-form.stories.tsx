import type { Meta, StoryObj } from "@storybook/react-vite";
import { MeterReadingForm } from "@/features/energy/components/meter-reading-form";
import { TODAY, appliancesFixture, dataOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/MeterReadingForm",
  component: MeterReadingForm,
  decorators: [(Story) => <div className="w-[40rem] max-w-full">{Story()}</div>],
  args: {
    readings: dataOverviewFixture.readings,
    appliances: appliancesFixture,
    now: { date: TODAY, time: "08:30" },
    canManage: true,
  },
} satisfies Meta<typeof MeterReadingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoReadings: Story = { args: { readings: [] } };
export const ReadOnly: Story = { args: { canManage: false } };
export const ValidationErrors: Story = {
  parameters: {
    router: { action: async () => ({ intent: "create-reading", errors: { valueKwh: ["Invalid input: expected number, received NaN"] } }) },
  },
};
