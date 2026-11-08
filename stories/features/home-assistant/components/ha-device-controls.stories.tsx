import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaDeviceControlPanel } from "@/features/home-assistant/components/ha-device-controls";

const meta = { title: "Features/HomeAssistant/Components/HaDeviceControlPanel", component: HaDeviceControlPanel, args: { deviceId: "light", initial: { connected: true, controls: [{ entityId: "light.kitchen", name: "Kitchen light", state: "on", updatedAt: "2026-11-07T10:00:00Z", actions: ["on", "off"], adjustment: { action: "brightness", value: 60, min: 1, max: 100, step: 1, unit: "%" } }] } } } satisfies Meta<typeof HaDeviceControlPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Offline: Story = { args: { initial: { connected: false, controls: [] } } };
export const NoCapabilities: Story = { args: { initial: { connected: true, controls: [] } } };
