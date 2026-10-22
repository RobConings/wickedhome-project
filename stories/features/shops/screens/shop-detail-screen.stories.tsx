import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";
import { ShopDetailScreen } from "@/features/shops/screens/shop-detail-screen";
import { shopFixtures, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shops/Screens/ShopDetailScreen",
  component: ShopDetailScreen,
  parameters: { layout: "fullscreen" },
  args: { shop: shopFixtures.colruyt, canEdit: true, canDelete: false, initialSelections: shopSelectionsFixture },
} satisfies Meta<typeof ShopDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BuiltInAsOwner: Story = {};
export const BuiltInAsAdult: Story = { args: { shop: shopFixtures.delhaize, canEdit: false, canRefreshIcon: true } };
/** No icon found yet: the type icon shows and the icon can be looked up again. */
export const WithoutIcon: Story = { args: { shop: shopFixtures.kruidvat } };
export const OwnShop: Story = { args: { shop: shopFixtures.bakery, canDelete: true } };
export const AsChild: Story = { args: { shop: shopFixtures.pharmacy, canEdit: false, canRefreshIcon: false } };
/** Looking for the logo on the website (it can take a few seconds): the button spins and the logo pulses. */
export const RefreshingIcon: Story = {
  args: { shop: shopFixtures.kruidvat, canRefreshIcon: true },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Refresh icon" }));
  },
};
/** Deleting: the confirm dialog stays open with a busy button until the shop is gone. */
export const Deleting: Story = {
  args: { shop: shopFixtures.bakery, canDelete: true },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  },
};
/** A webshop searched for recipe ingredients: the switch in the website card and the marker in the header. */
export const IngredientSearch: Story = { args: { shop: shopFixtures.delhaize, canEdit: false, canRefreshIcon: true } };
export const Mobile: Story = { args: { shop: shopFixtures.delhaize }, globals: { viewport: { value: "mobile1" } } };
export const WithShoppingItems: Story = {
  args: {
    shoppingItems: (
      <ul className="divide-y rounded-xl border bg-card px-4 text-sm">
        <li className="py-2.5">Milk ×2</li>
        <li className="py-2.5">Bread</li>
        <li className="py-2.5">Coffee beans</li>
      </ul>
    ),
  },
};
