import type { Meta, StoryObj } from "@storybook/react-vite";
import { HaScenesPanel } from "@/features/home-assistant/components/ha-scenes-panel";

const meta = { title: "Features/HomeAssistant/Components/HaScenesPanel", component: HaScenesPanel, args: { initial: [{ entityId: "scene.evening", name: "Cosy evening" }, { entityId: "scene.film", name: "Movie time" }] } } satisfies Meta<typeof HaScenesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Empty: Story = { args: { initial: [] } };
