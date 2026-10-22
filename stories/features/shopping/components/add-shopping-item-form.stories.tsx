import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { AddShoppingItemForm } from "@/features/shopping/components/add-shopping-item-form";
import { shopFixtures } from "../../shops/fixtures";
import { fakeLinkPreview, productListFixture, productSelectionsFixture, shopListFixture, shopSelectionsFixture } from "../fixtures";

const meta = {
  title: "Features/Shopping/Components/AddShoppingItemForm",
  component: AddShoppingItemForm,
  args: {
    products: productListFixture,
    shops: shopListFixture,
    onAdd: fn(async () => undefined),
    previewLink: fakeLinkPreview,
    initialSelections: { products: productSelectionsFixture, shops: shopSelectionsFixture },
  },
  parameters: {
    docs: { description: { story: "Paste https://www.gamma.be/nl/assortiment/tacker/p/B123456 to see the link preview." } },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddShoppingItemForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const FixedShop: Story = { args: { fixedShopId: shopFixtures.colruyt.id } };

/** Adding takes a while: the button spins and the fields wait, the text stays until it's saved. */
export const Adding: Story = {
  args: { onAdd: fn(() => new Promise<never>(() => undefined)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "New item" }), "Oat milk{Enter}");
  },
};
/** A pasted webshop link is being read. */
export const ReadingLink: Story = {
  args: { previewLink: () => new Promise<never>(() => undefined) },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", { name: "New item" }), "https://www.gamma.be/nl/assortiment/tacker/p/B123456");
  },
};
/** Embedded forms load products and shops themselves: the pickers show placeholders meanwhile. */
export const CatalogueLoading: Story = { args: { products: [], shops: [], catalogLoading: true } };
