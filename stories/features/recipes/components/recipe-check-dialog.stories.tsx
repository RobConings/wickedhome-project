import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/ui/button";
import { RecipeCheckDialog } from "@/features/recipes/components/recipe-check-dialog";
import { failedCheck, fakeCheck, recipeFixture, stalledCheck } from "../fixtures";
import { compareNeed, type UnitDefinition } from "@/types/units";
import type { RecipeCheck } from "@/features/recipes/types/recipes";

const meta = {
  title: "Features/Recipes/Components/RecipeCheckDialog",
  component: RecipeCheckDialog,
  args: {
    recipe: recipeFixture,
    open: true,
    load: fakeCheck,
    trigger: <Button>Add to To cook</Button>,
  },
} satisfies Meta<typeof RecipeCheckDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Missing ingredients are ticked to buy; one is on the list already; basil has no product (stock unknown). */
export const Default: Story = {};
/** Waiting for the stock check. */
export const Loading: Story = { args: { load: stalledCheck } };
export const Failed: Story = { args: { load: failedCheck } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };

function vegetableCheck(servings: number, units: UnitDefinition[] = []): RecipeCheck {
  return { recipeId: recipeFixture.id, servings, ingredients: [
    { id: "onions", name: "Uien", unit: "zak", recipeUnit: "stuk", quantity: 2, stock: 1 },
    { id: "chicory", name: "Witloof", unit: "kg", recipeUnit: "stronkje", quantity: 4, stock: 0 },
  ].map((row) => {
    const product = { id: row.id, name: row.name, unit: row.unit, packageAmount: null, packageUnit: null, imageUrl: null, shopLink: null, units };
    return { ...compareNeed({ quantity: row.quantity, unit: row.recipeUnit }, servings / 4, row.stock, product), ingredientId: row.id, name: row.name, productId: row.id, productName: row.name, product, unit: row.recipeUnit, stock: row.stock, note: null, optional: false, onList: false };
  }) };
}
export const OnionsAndEmptyChicory: Story = { args: { recipe: { ...recipeFixture, servings: 8 }, load: async (_id, servings) => vegetableCheck(servings) } };
export const WithCentralConversions: Story = { args: { recipe: { ...recipeFixture, servings: 8 }, load: async (_id, servings) => vegetableCheck(servings, [{ name: "stronkje", referenceUnit: "g", factor: 150, rounding: 1, aliases: [] }, { name: "zak", referenceUnit: "stuk", factor: 12, rounding: 1, aliases: [] }]) } };
