import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShopTile } from "@/features/shops/components/shop-tile";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopTile",
  component: ShopTile,
  args: { shop: shopFixtures.delhaize, isFavorite: false, onToggleFavorite: fn() },
  /** About the width of a tile on a phone (two per row). */
  decorators: [(Story) => <div className="w-44"><Story /></div>],
} satisfies Meta<typeof ShopTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltIn: Story = {};
export const Favorite: Story = { args: { shop: shopFixtures.colruyt, isFavorite: true } };
export const OwnWithoutWebsite: Story = { args: { shop: shopFixtures.bakery } };
export const NoLogoYet: Story = { args: { shop: shopFixtures.kruidvat } };
