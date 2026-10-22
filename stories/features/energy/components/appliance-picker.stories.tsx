import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppliancePicker } from "@/features/energy/components/appliance-picker";
import { applianceFixtures, appliancesFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/AppliancePicker",
  component: AppliancePicker,
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
  args: {
    appliances: appliancesFixture,
    clearable: true,
    initialSelections: { favoriteIds: [applianceFixtures.jacuzzi.id], recentIds: [applianceFixtures.heatPump.id] },
  },
} satisfies Meta<typeof AppliancePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Selected: Story = { args: { defaultValue: applianceFixtures.dryer.id } };
