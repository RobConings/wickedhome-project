import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkedImagePicker } from "@/features/documents/components/linked-image-picker";

const meta = { title: "Features/Documents/Components/LinkedImagePicker", component: LinkedImagePicker, args: { entityType: "device", entityId: "washer", selectedId: null, canManage: true, initialImages: [] } } satisfies Meta<typeof LinkedImagePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

