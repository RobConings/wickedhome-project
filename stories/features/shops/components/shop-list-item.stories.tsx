import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ShopListItem } from "@/features/shops/components/shop-list-item";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopListItem",
  component: ShopListItem,
  args: { shop: shopFixtures.delhaize, isFavorite: false, onToggleFavorite: fn() },
  decorators: [
    (Story) => (
      <div className="w-96 rounded-xl border bg-card px-4 py-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShopListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltIn: Story = {};
export const Favorite: Story = { args: { shop: shopFixtures.colruyt, isFavorite: true } };
export const OwnWithoutWebsite: Story = { args: { shop: shopFixtures.bakery } };
/** Transparent logo on the white tile (check dark mode). */
export const TransparentLogo: Story = { args: { shop: shopFixtures.bol } };
/** The icon URL fails to load: falls back to the type icon. */
export const BrokenLogo: Story = { args: { shop: shopFixtures.pharmacy } };
export const NoLogoYet: Story = { args: { shop: shopFixtures.kruidvat } };
