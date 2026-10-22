import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopLogo } from "@/features/shops/components/shop-logo";
import { shopFixtures, shopIconFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopLogo",
  component: ShopLogo,
  args: { shop: shopFixtures.colruyt, size: "md" },
} satisfies Meta<typeof ShopLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
/** A logo that only draws a glyph: the white tile keeps it readable in dark mode. */
export const Transparent: Story = { args: { shop: shopFixtures.bol } };
/** A real image file (PNG) instead of an inline SVG. */
export const PngImage: Story = { args: { shop: { type: "other", iconUrl: shopIconFixtures.brand } } };
/** No icon found (yet): the shop type icon. */
export const NoIcon: Story = { args: { shop: shopFixtures.kruidvat } };
/** The image fails to load: falls back to the shop type icon. */
export const BrokenImage: Story = { args: { shop: shopFixtures.pharmacy } };

export const AllSizes: Story = {
  render: () => (
    <div className="grid grid-cols-[auto_auto_auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
      {[shopFixtures.colruyt, shopFixtures.bol, shopFixtures.coolblue, shopFixtures.kruidvat, shopFixtures.pharmacy].map((shop) => (
        <div key={shop.id} className="contents">
          <ShopLogo shop={shop} size="sm" />
          <ShopLogo shop={shop} size="md" />
          <ShopLogo shop={shop} size="lg" />
          <span>{shop.name}</span>
        </div>
      ))}
    </div>
  ),
};
