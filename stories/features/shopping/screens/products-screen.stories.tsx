import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProductsScreen } from "@/features/shopping/screens/products-screen";
import { productListFixture, shopListFixture, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Screens/ProductsScreen",
  component: ProductsScreen,
  parameters: { layout: "fullscreen" },
  args: { data: { products: productListFixture, shops: shopListFixture }, canManage: true, initialSelections: shopSelectionsFixture },
} satisfies Meta<typeof ProductsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Catalogue: Story = {};
export const AsChild: Story = { args: { canManage: false } };
export const Empty: Story = { args: { data: { products: [], shops: shopListFixture } } };
