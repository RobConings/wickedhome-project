import type { Meta, StoryObj } from "@storybook/react-vite";
import { StocktakeDialog } from "@/features/inventory/components/stocktake-dialog";
import { inventoryPageFixture } from "../fixtures";

const meta = {
  title: "Features/Inventory/Components/StocktakeDialog",
  component: StocktakeDialog,
  args: {
    items: inventoryPageFixture.stock,
    products: inventoryPageFixture.products,
    defaultOpen: true,
    onSave: async (id, input) => ({ stockItem: { ...inventoryPageFixture.stock.find((item) => item.id === id)!, quantity: input.quantity, updatedAt: new Date().toISOString() }, addedToShoppingList: false }),
    onSetExclusion: async (id, input) => ({ ...inventoryPageFixture.stock.find((item) => item.id === id)!, countExcludedUntilEmpty: input.excluded, updatedAt: new Date().toISOString() }),
    onAddToShopping: async () => "added",
  },
} satisfies Meta<typeof StocktakeDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllProducts: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
export const OnlyZeroStock: Story = { args: { items: inventoryPageFixture.stock.filter((item) => item.quantity === 0) } };
export const ExcludedUntilEmpty: Story = { args: { items: inventoryPageFixture.stock.map((item) => ({ ...item, countExcludedUntilEmpty: item.quantity > 0 })) } };
export const LinkedProducts: Story = {
  args: {
    items: inventoryPageFixture.stock.slice(0, 1),
    products: [
      { id: inventoryPageFixture.stock[0]!.productId, name: "Aardappelen", stockProductId: null },
      { id: "boni", name: "BONI Nicola aardappelen 2,5 kg", stockProductId: inventoryPageFixture.stock[0]!.productId },
    ],
  },
};
export const ShoppingRequests: Story = { ...LinkedProducts, args: { ...LinkedProducts.args, onAddToShopping: undefined } };
