import type { Meta, StoryObj } from "@storybook/react-vite";
import { CookingIngredientRow } from "@/features/recipes/components/cooking-ingredient-row";
import { cookingIngredientFixtures } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/CookingIngredientRow",
  component: CookingIngredientRow,
  args: {
    item: cookingIngredientFixtures.tomatoes,
    entryId: "mp-spaghetti",
    onUndo: () => undefined,
  },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof CookingIngredientRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Not used yet: one tap takes the planned 2 cans. */
export const Default: Story = {};
/** The step mentions it: marked. */
export const Mentioned: Story = { args: { mentioned: true } };
/** All used, with the last tap undoable. */
export const Used: Story = { args: { item: cookingIngredientFixtures.onion } };
/** Converted: 300 g of grated cheese = 1,5 packs of 200 g; one tap takes 1,5 packs. With photo link and webshop. */
export const Converted: Story = { args: { item: cookingIngredientFixtures.cheese } };
/** "2 el" doesn't convert to bottles: "Used" asks how much (in bottles), and the row links to the product to set its content. */
export const UnknownAmount: Story = { args: { item: cookingIngredientFixtures.oil } };
/** No product: recorded without touching stock. */
export const FreeText: Story = {
  args: { item: cookingIngredientFixtures.basil },
};
/** The tap is being saved: the counts already show it. */
export const Loading: Story = {
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
