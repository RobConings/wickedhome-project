import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { HaCameraVideo } from "@/features/home-assistant/components/ha-camera-video";

const meta = { title: "Features/HomeAssistant/Components/HaCameraVideo", component: HaCameraVideo,
  args: { url: "", label: "Camera live view", onFailure: fn() },
} satisfies Meta<typeof HaCameraVideo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WaitingForSource: Story = {};
