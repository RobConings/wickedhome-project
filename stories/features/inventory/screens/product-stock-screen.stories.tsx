import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductStockScreen } from "@/features/inventory/screens/product-stock-screen";
import { productFixtures, productSelectionsFixture, shopSelectionsFixture } from "../../shopping/fixtures";
import { baconStockPageFixture, placeSelectionsFixture, productStockPageFixture } from "../fixtures";

const meta = {
  title: "Features/Inventory/Screens/ProductStockScreen",
  component: ProductStockScreen,
  parameters: { layout: "fullscreen" },
  args: { data: productStockPageFixture, canManage: true, initialSelections: { products: productSelectionsFixture, places: placeSelectionsFixture, shops: shopSelectionsFixture } },
} satisfies Meta<typeof ProductStockScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CoffeeInTwoPlaces: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const NotKeptYet: Story = {
  args: { data: { ...productStockPageFixture, product: productFixtures.nailGun, stock: { productId: "pr-nail-gun", stockItems: [], movements: [] } } },
};

/** Alternatives: two brands share the stock of the generic product; the opened brand is highlighted. */
export const SharedStock: Story = { args: { data: { ...baconStockPageFixture, highlightId: "pr-bacon-delhaize" } } };
export const SharedStockMobile: Story = { ...SharedStock, globals: { viewport: { value: "mobile1" } } };
export const MixedUnits: Story = { args: { data: { ...productStockPageFixture, stock: {
  ...productStockPageFixture.stock,
  stockItems: productStockPageFixture.stock.stockItems.map((item, index) => ({ ...item, unit: index ? "g" : "pack" })),
} } } };
export const LowStock: Story = { args: { data: { ...productStockPageFixture, stock: {
  ...productStockPageFixture.stock,
  stockItems: [{ ...productStockPageFixture.stock.stockItems[0]!, quantity: 0.5, minQuantity: 1, isLow: true }],
} } } };
export const BrokenImage: Story = { args: { data: { ...productStockPageFixture,
  product: { ...productStockPageFixture.product, imageUrl: "/missing-product-image.png" },
} } };
