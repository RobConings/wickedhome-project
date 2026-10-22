import type { Meta, StoryObj } from "@storybook/react-vite";
import { EnergyMeterList } from "@/features/energy/components/energy-meter-list";
import { appliancesFixture, dataOverviewFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/EnergyMeterList",
  component: EnergyMeterList,
  decorators: [(Story) => <div className="w-96">{Story()}</div>],
  args: { meters: dataOverviewFixture.meters, appliances: appliancesFixture },
} satisfies Meta<typeof EnergyMeterList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { meters: [] } };
