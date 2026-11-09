import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon, ShoppingCartIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SplitAction } from "@/components/shared/split-action";
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

/** Regression: a long Dutch headline keeps both CTAs beneath it; secondary copy is hidden on phones. */
export const ShoppingMobileTwoActions: Story = {
  globals: { viewport: { value: "mobile1" } },
  args: {
    title: "Boodschappen",
    description: "Alles wat je wilt kopen, met aparte filters voor je lijsten en voorraad.",
    icon: ShoppingCartIcon,
    actions: <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-center xl:w-auto">
      <SplitAction icon={ShoppingCartIcon} label="Start winkelen" menuLabel="Meer winkelacties"
        onClick={() => {}} menu={<DropdownMenuItem>Winkelsessies</DropdownMenuItem>} />
      <SplitAction icon={PlusIcon} label="Boodschap toevoegen" menuLabel="Meer boodschappenacties"
        onClick={() => {}} variant="outline" menu={<DropdownMenuItem>Nieuwe lijst</DropdownMenuItem>} />
    </div>,
  },
};
