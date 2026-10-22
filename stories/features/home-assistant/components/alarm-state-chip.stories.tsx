import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlarmStateChip } from "@/features/home-assistant/components/alarm-state-chip";
import { ALARM_STATES } from "@/features/home-assistant/types/home-assistant";

const meta = {
  title: "Features/HomeAssistant/Components/AlarmStateChip",
  component: AlarmStateChip,
  args: { state: "disarmed" },
} satisfies Meta<typeof AlarmStateChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disarmed: Story = {};
export const Triggered: Story = { args: { state: "triggered" } };
/** Every Home Assistant alarm state, with the plan's colours. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ALARM_STATES.map((state) => (
        <AlarmStateChip key={state} state={state} />
      ))}
    </div>
  ),
};
