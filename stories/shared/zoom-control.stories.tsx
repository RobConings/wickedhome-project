import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ZoomControl } from "@/components/shared/zoom-control";

const meta = {
  title: "Shared/ZoomControl",
  component: ZoomControl,
  args: {
    zoom: 100,
    onZoomIn: fn(),
    onZoomOut: fn(),
    onFit: fn(),
    labels: { zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to screen" },
  },
} satisfies Meta<typeof ZoomControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AtMaximum: Story = { args: { zoom: 500, canZoomIn: false } };
export const AtMinimum: Story = { args: { zoom: 5, canZoomOut: false } };
