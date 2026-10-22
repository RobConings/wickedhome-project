import type { Meta, StoryObj } from "@storybook/react-vite";
import { GasSettingsCard } from "@/features/energy/components/gas-settings-card";
import { gasSettingsFixture } from "../fixtures";

const meta = {
  title: "Features/Energy/Components/GasSettingsCard",
  component: GasSettingsCard,
  decorators: [(Story) => <div className="w-[26rem]">{Story()}</div>],
  args: { settings: gasSettingsFixture, canManage: true },
} satisfies Meta<typeof GasSettingsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NotSetUp: Story = { args: { settings: { gasEan: null, gasCalorificKwhPerM3: 11.4 } } };
export const ReadOnly: Story = { args: { canManage: false } };
