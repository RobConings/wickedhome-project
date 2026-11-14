import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaAlarmPanel } from "@/features/home-assistant/components/ha-alarm-panel";
const meta = { title: "Features/HomeAssistant/Components/HaAlarmPanel", component: HaAlarmPanel, args: { canControl: false, initial: null } } satisfies Meta<typeof HaAlarmPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoPanel: Story = {};
