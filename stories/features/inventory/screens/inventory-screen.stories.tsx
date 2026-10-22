import type { Meta, StoryObj } from "@storybook/react-vite";
import { InventoryScreen } from "@/features/inventory/screens/inventory-screen";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { inventoryPageFixture, placeSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Inventory/Screens/InventoryScreen",
  component: InventoryScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: inventoryPageFixture,
    canManage: true,
    today: "2026-10-02",
    initialSelections: { products: productSelectionsFixture, places: placeSelectionsFixture },
  },
} satisfies Meta<typeof InventoryScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pantry, kitchen, bathroom and garage, with coffee, dishwasher tablets and screws running low. */
export const PantryAndGarage: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { data: { ...inventoryPageFixture, stock: [] } } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
