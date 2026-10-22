import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ProductListItem } from "@/features/shopping/components/product-list-item";
import { productFixtures, shopListFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/ProductListItem",
  component: ProductListItem,
  args: { product: productFixtures.nailGun, shops: shopListFixture, canManage: true },
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-xl border bg-card px-4 py-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two shops with a price: the row shows the lowest one. */
export const TwoShops: Story = {};
export const OnlyUsualShop: Story = { args: { product: productFixtures.milk } };
export const AsChild: Story = { args: { canManage: false } };

/** "Put on the list" is being saved: the cart button spins. */
export const AddingToList: Story = {
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Put .* on the list$/ }));
  },
};
