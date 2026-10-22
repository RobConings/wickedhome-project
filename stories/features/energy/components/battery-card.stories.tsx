import type { Meta, StoryObj } from "@storybook/react-vite";
import { BatteryCard } from "@/features/energy/components/battery-card";
import { TODAY, batteryFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/BatteryCard",
  component: BatteryCard,
  decorators: [(Story) => <div className="w-[26rem]">{Story()}</div>],
  args: { battery: batteryFixture, today: TODAY, canManage: true },
} satisfies Meta<typeof BatteryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Planned: Story = {};
export const Installed: Story = { args: { today: "2027-06-01" } };
export const ReadOnly: Story = { args: { canManage: false } };
