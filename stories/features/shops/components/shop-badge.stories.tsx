import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopBadge } from "@/features/shops/components/shop-badge";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopBadge",
  component: ShopBadge,
  args: { shop: shopFixtures.colruyt },
} satisfies Meta<typeof ShopBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Linked: Story = { args: { linked: true, shop: shopFixtures.gamma } };
export const LongName: Story = { args: { shop: shopFixtures.bakery } };
/** No logo (yet): the type icon shows instead. */
export const WithoutLogo: Story = { args: { shop: shopFixtures.kruidvat } };
/** A shop reference without `iconUrl` (e.g. from another feature) shows the type icon. */
export const ReferenceOnly: Story = { args: { shop: { id: "s-ref", name: "Colruyt", type: "supermarket" } } };
export const Several: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <ShopBadge shop={shopFixtures.colruyt} />
      <ShopBadge shop={shopFixtures.kruidvat} />
      <ShopBadge shop={shopFixtures.bol} linked />
      <ShopBadge shop={shopFixtures.ikea} />
      <ShopBadge shop={shopFixtures.pharmacy} />
    </div>
  ),
};
