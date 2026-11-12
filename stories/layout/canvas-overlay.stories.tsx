import type { Meta, StoryObj } from "@storybook/react-vite";
import { CanvasOverlay } from "@/components/layout/canvas-overlay";
import { Text } from "@/components/ui/text";
const meta = { title: "Layout/CanvasOverlay", component: CanvasOverlay, parameters: { layout: "padded" }, args: { children: <Text>Map status</Text> }, decorators: [(Story) => <div className="relative h-64 w-full rounded-xl border bg-muted"><Story /></div>] } satisfies Meta<typeof CanvasOverlay>;
export default meta; type Story = StoryObj<typeof meta>;
export const BottomStart: Story = {};
export const TopEnd: Story = { args: { corner: "top-end" } };
