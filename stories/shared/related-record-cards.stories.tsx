import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderIcon, ListChecksIcon, PackageIcon, ReceiptIcon, WalletIcon } from "lucide-react";
import { RelatedRecordCards } from "@/components/shared/related-record-cards";

const meta = {
  title: "Shared/RelatedRecordCards",
  component: RelatedRecordCards,
  args: {
    label: "Related to this project",
    items: [
      { id: "tasks", label: "Tasks", value: 3, to: "#tasks", icon: ListChecksIcon, accent: "tasks", current: true },
      { id: "materials", label: "Materials", value: 3, to: "#materials", icon: PackageIcon, accent: "shopping" },
      { id: "expenses", label: "Expenses", value: 2, to: "#expenses", icon: ReceiptIcon, accent: "finance" },
      { id: "costs", label: "Costs", value: "€460", to: "#costs", icon: WalletIcon, accent: "finance" },
      { id: "documents", label: "Documents", to: "#documents", icon: FolderIcon, accent: "documents" },
    ],
  },
} satisfies Meta<typeof RelatedRecordCards>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } };
