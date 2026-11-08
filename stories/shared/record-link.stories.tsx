import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordLink } from "@/components/shared/record-link";

const meta = { title: "Shared/RecordLink", component: RecordLink, args: { to: "/projects/bathroom", children: "Bathroom renovation" } } satisfies Meta<typeof RecordLink>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };

