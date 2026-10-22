import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopViewScreen } from "@/features/shopping/screens/shop-view-screen";
import { emptyShoppingPageFixture, fakeLinkPreview, productSelectionsFixture, shopSelectionsFixture, shoppingPageFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Screens/ShopViewScreen",
  component: ShopViewScreen,
  parameters: { layout: "fullscreen" },
  args: {
    data: shoppingPageFixture,
    shopKey: "s-colruyt",
    previewLink: fakeLinkPreview,
    refreshIntervalMs: null,
    initialSelections: { products: productSelectionsFixture, shops: shopSelectionsFixture },
  },
} satisfies Meta<typeof ShopViewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Saturday groceries at Colruyt: staples, low stock and one-offs, grouped by aisle. */
export const Colruyt: Story = {};
/** Gamma: materials for "Insulate the jacuzzi" and screws running low in the garage. */
export const Gamma: Story = { args: { shopKey: "s-gamma" } };
export const NoShopChosen: Story = { args: { shopKey: "none" } };
export const ChooseShop: Story = { args: { shopKey: null } };
export const NothingToBuy: Story = { args: { data: emptyShoppingPageFixture, shopKey: null } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
