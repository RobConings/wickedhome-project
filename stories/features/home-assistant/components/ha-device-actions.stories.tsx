import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaDeviceActions } from "@/features/home-assistant/components/ha-device-actions";
import { cameraPreview } from "../camera-fixtures";

const meta = { title: "Features/HomeAssistant/Components/HaDeviceActions", component: HaDeviceActions,
  args: { device: { id: "camera-kitchen", values: [{ fieldKey: "state", source: "home_assistant", haEntityId: "camera.kitchen", haAttribute: null, value: "idle", updatedAt: "2026-11-14T10:00:00Z" }] },
    initialCameras: { connected: true, cameras: [{ entityId: "camera.kitchen", name: "Kitchen", available: true, canCapture: true, canStream: false }] }, previewImage: cameraPreview },
} satisfies Meta<typeof HaDeviceActions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Camera: Story = {};
