import type { Meta, StoryObj } from "@storybook/react-vite";
import { PencilIcon, ShoppingCartIcon, BoxesIcon, LinkIcon } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SplitAction } from "@/components/shared/split-action";

const meta = {
  title: "Shared/SplitAction",
  component: SplitAction,
  parameters: { layout: "padded" },
  args: {
    label: "Add to shopping list",
    menuLabel: "More product actions",
    icon: ShoppingCartIcon,
    onClick: () => {},
    menu: <><DropdownMenuItem><BoxesIcon />Adjust stock</DropdownMenuItem><DropdownMenuItem><LinkIcon />See related records</DropdownMenuItem></>,
  },
} satisfies Meta<typeof SplitAction>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Action: Story = {};
export const Management: Story = { args: { icon: PencilIcon, label: "Edit product", menuLabel: "More product management", variant: "outline" } };
export const Phone: Story = { globals: { viewport: { value: "mobile1" } } };
export const Busy: Story = { args: { busy: true } };
export const Disabled: Story = { args: { disabled: true } };
