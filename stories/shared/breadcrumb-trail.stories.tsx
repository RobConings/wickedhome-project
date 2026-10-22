import type { Meta, StoryObj } from "@storybook/react-vite";
import { HardDriveIcon } from "lucide-react";
import { BreadcrumbTrail } from "@/components/shared/breadcrumb-trail";

const meta = {
  title: "Shared/BreadcrumbTrail",
  component: BreadcrumbTrail,
  args: {
    label: "Folder path",
    items: [
      { label: "Documents", to: "/documents", icon: HardDriveIcon },
      { label: "Huis", to: "/documents/folders/f-huis" },
      { label: "Notaris akte" },
    ],
  },
} satisfies Meta<typeof BreadcrumbTrail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Deep: Story = {
  args: {
    items: [
      { label: "Documents", to: "/documents", icon: HardDriveIcon },
      { label: "Huis", to: "/a" },
      { label: "Renovatie 2026", to: "/b" },
      { label: "Keuken", to: "/c" },
      { label: "Offertes", to: "/d" },
      { label: "Vanhout", to: "/e" },
      { label: "Versie 3" },
    ],
  },
};
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-64">{Story()}</div>],
  args: Deep.args,
};
