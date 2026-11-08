import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShoppingItemScreen } from "@/features/shopping/screens/shopping-item-screen";
import { itemListFixture, productListFixture, shoppingPageFixture } from "../fixtures";
const meta = {
  title: "Features/Shopping/Screens/ShoppingItemScreen", component: ShoppingItemScreen,
  parameters: { layout: "fullscreen" },
  args: { item: itemListFixture[0]!, products: productListFixture, shops: shoppingPageFixture.shops, canManage: true },
} satisfies Meta<typeof ShoppingItemScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Child: Story = { args: { canManage: false } };
export const Bought: Story = { args: { item: { ...itemListFixture[0]!, status: "bought", boughtByName: "Rob" } } };
