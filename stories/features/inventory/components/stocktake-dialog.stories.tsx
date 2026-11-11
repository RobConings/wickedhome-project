import type { Meta, StoryObj } from "@storybook/react-vite";
import { StocktakeDialog } from "@/features/inventory/components/stocktake-dialog";
import { inventoryPageFixture } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StocktakeDialog",
  component: StocktakeDialog,
  args: {
    items: inventoryPageFixture.stock,
    defaultOpen: true,
    onSave: async (id, input) => ({ stockItem: { ...inventoryPageFixture.stock.find((item) => item.id === id)!, quantity: input.quantity, updatedAt: new Date().toISOString() }, addedToShoppingList: false }),
  },
} satisfies Meta<typeof StocktakeDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllProducts: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
export const OnlyZeroStock: Story = { args: { items: inventoryPageFixture.stock.filter((item) => item.quantity === 0) } };
