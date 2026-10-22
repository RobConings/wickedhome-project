import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlarmLogList } from "@/features/home-assistant/components/alarm-log-list";
import { alarmLogFixture } from "../fixtures";

const meta = {
  title: "Features/HomeAssistant/Components/AlarmLogList",
  component: AlarmLogList,
  args: { entries: alarmLogFixture },
} satisfies Meta<typeof AlarmLogList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Who armed or disarmed, when, and the outcome (codes are never stored). */
export const Default: Story = {};
export const Empty: Story = { args: { entries: [] } };
