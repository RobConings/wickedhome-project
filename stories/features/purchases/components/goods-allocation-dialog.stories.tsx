import type { Meta, StoryObj } from "@storybook/react-vite";
import { GoodsAllocationDialog } from "@/features/purchases/components/goods-allocation-dialog";
const meta = { title: "Features/Purchases/Components/GoodsAllocationDialog", component: GoodsAllocationDialog,
  args: { initialProjects: [{ id: "bathroom", name: "Bathroom" }], allocation: { acquisitionId: "line", revision: 1, quantity: 3, unit: "pack", explicit: true, householdQuantity: 1, unallocatedQuantity: 0, projects: [{ projectId: "bathroom", name: "Bathroom", quantity: 2 }] } },
} satisfies Meta<typeof GoodsAllocationDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
