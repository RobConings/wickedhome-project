import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ProductCard } from "@/features/shopping/components/product-card";
import { productFixtures, shopListFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductCard",
  component: ProductCard,
  args: { product: productFixtures.nailGun, shops: shopListFixture, canManage: true },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoShops: Story = {};
export const GroceryWithBarcode: Story = { args: { product: productFixtures.coffee } };
export const OwnQrLabel: Story = { args: { product: productFixtures.screws } };
export const AsChild: Story = { args: { canManage: false } };

/** As narrow as a tile on a phone (two per row). */
export const PhoneTile: Story = {
  decorators: [
    (Story) => (
      <div className="w-44">
        <Story />
      </div>
    ),
  ],
};

/** "Add to the list" is being saved: the cart button spins. */
export const AddingToList: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Put .* on the list$/ }));
  },
};
