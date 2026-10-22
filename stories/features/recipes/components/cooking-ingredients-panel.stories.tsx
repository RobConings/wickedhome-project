import type { Meta, StoryObj } from "@storybook/react-vite";
import { CookingIngredientsPanel } from "@/features/recipes/components/cooking-ingredients-panel";
import { productSelectionsFixture } from "../../shopping/fixtures";
import { cookingStateFixture, recipeProductsFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Components/CookingIngredientsPanel",
  component: CookingIngredientsPanel,
  args: {
    entryId: cookingStateFixture.entry.id,
    ingredients: cookingStateFixture.ingredients,
    extras: cookingStateFixture.extras,
    stepText: cookingStateFixture.recipe.steps[1]!.text,
    products: recipeProductsFixture,
    canSaveToRecipe: true,
    onUndo: () => undefined,
    initialSelections: productSelectionsFixture,
  },
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof CookingIngredientsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "Fry the mince": the mince comes first; garlic was added while cooking. */
export const Default: Story = {};
export const Empty: Story = { args: { ingredients: [], extras: [] } };
/** The meal was made: taps are off. */
export const Made: Story = { args: { disabled: true } };
/** A tap is being saved. */
export const Loading: Story = {
  parameters: {
    router: { action: async () => new Promise<never>(() => undefined) },
  },
};
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
