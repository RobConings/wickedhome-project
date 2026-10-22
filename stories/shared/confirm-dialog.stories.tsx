import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const meta = {
  title: "Shared/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    trigger: <Button variant="outline">Delete item</Button>,
    title: "Delete this item?",
    description: "This can't be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    destructive: true,
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Destructive: Story = {};
export const Neutral: Story = {
  args: {
    trigger: <Button variant="outline">Archive</Button>,
    title: "Archive this item?",
    confirmLabel: "Archive",
    destructive: false,
  },
};
