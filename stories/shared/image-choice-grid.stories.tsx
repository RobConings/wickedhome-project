import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageChoiceGrid } from "@/components/shared/image-choice-grid";

const meta = { title: "Shared/ImageChoiceGrid", component: ImageChoiceGrid, args: { images: [{ id: "cover", name: "Room", url: "/brand/icon-192.png" }], selectedId: "cover", onSelect: () => undefined, labels: { empty: "Attach a photo first", clear: "Clear image", use: (name) => `Use ${name}`, remove: (name) => `Remove ${name}` } } } satisfies Meta<typeof ImageChoiceGrid>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Empty: Story = { args: { images: [] } };
export const ReadOnly: Story = { args: { disabled: true } };
