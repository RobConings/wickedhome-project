import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaCameraPanel } from "@/features/home-assistant/components/ha-camera-panel";

import { cameraPreview } from "../camera-fixtures";

const camera = { entityId: "camera.kitchen", name: "Kitchen", available: true, canCapture: true, canStream: false };
const meta = { title: "Features/HomeAssistant/Components/HaCameraPanel", component: HaCameraPanel,
  args: { deviceId: "camera-kitchen", initial: { connected: true, cameras: [camera] }, previewImage: cameraPreview },
} satisfies Meta<typeof HaCameraPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Snapshot: Story = {};
export const Interactive: Story = { args: { previewImage: undefined, initial: { connected: true, cameras: [{ ...camera, canStream: true }] } } };
export const LiveAvailable: Story = { args: { initial: { connected: true, cameras: [{ ...camera, canStream: true }] } } };
export const NoPicture: Story = { args: { previewImage: "" } };
export const CameraOffline: Story = { args: { previewImage: "", initial: { connected: true, cameras: [{ ...camera, available: false, canCapture: false }] } } };
export const ConnectionOffline: Story = { args: { initial: { connected: false, cameras: [] } } };
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
