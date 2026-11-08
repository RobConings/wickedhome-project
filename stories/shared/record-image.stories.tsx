import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordImage } from "@/components/shared/record-image";

const meta = { title: "Shared/RecordImage", component: RecordImage, args: { src: "/brand/icon-192.png", alt: "WickedHome", shape: "avatar" } } satisfies Meta<typeof RecordImage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Banner: Story = { args: { shape: "banner" } };
export const Missing: Story = { args: { src: null } };
export const Failed: Story = { args: { src: "/missing-image.png" } };
