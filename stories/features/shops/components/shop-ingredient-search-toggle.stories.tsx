import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ShopIngredientSearchToggle } from "@/features/shops/components/shop-ingredient-search-toggle";
import { shopFixtures } from "../fixtures";

const meta = {
  title: "Features/Shops/Components/ShopIngredientSearchToggle",
  component: ShopIngredientSearchToggle,
  args: { shop: shopFixtures.delhaize, canChange: true },
  decorators: [
    (Story) => (
      <div className="max-w-sm rounded-xl border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShopIngredientSearchToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Switched on: the assistant searches this webshop for recipe ingredients. */
export const Default: Story = {};
export const Off: Story = { args: { shop: shopFixtures.gamma } };
/** No webshop: it can't be switched on. */
export const WithoutWebshop: Story = { args: { shop: shopFixtures.colruyt } };
/** A child sees the state but can't change it. */
export const ReadOnly: Story = { args: { canChange: false } };
/** Saving takes a while: the switch shows its new state at once, with a spinner, until the save settles. */
export const Saving: Story = {
  args: { shop: shopFixtures.gamma },
  parameters: { router: { action: async () => new Promise<never>(() => undefined) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("switch"));
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
