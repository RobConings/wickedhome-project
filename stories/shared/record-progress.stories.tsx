import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecordProgress } from "@/components/shared/record-progress";

const meta = { title: "Shared/RecordProgress", component: RecordProgress, args: { label: "Shopping progress", completed: 4, total: 8, summary: "3 bought · 1 not now" } } satisfies Meta<typeof RecordProgress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
export const Empty: Story = { args: { completed: 0, total: 0 } };
export const Complete: Story = { args: { completed: 8 } };
