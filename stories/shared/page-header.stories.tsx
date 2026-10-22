import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

const meta = {
  title: "Shared/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: {
    title: "Page title",
    description: "One sentence that explains what this page is for.",
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithEyebrow: Story = { args: { eyebrow: "Thursday 2 October" } };
/** With the section icon in a chip (the accent bar and chip follow the toolbar's Accent). */
export const WithIcon: Story = { args: { icon: WalletIcon, title: "Expenses" } };
export const WithActions: Story = {
  args: {
    actions: (
      <Button>
        <PlusIcon />
        Add item
      </Button>
    ),
  },
};
