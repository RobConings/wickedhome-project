import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopMarkers } from "@/features/shops/components/shop-markers";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopMarkers",
  component: ShopMarkers,
  args: { shop: shopFixtures.delhaize },
} satisfies Meta<typeof ShopMarkers>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Built-in, with a webshop that is searched for recipe ingredients. */
export const BuiltInWithWebshop: Story = {};
export const BuiltIn: Story = { args: { shop: shopFixtures.colruyt } };
export const Own: Story = { args: { shop: shopFixtures.bakery } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
