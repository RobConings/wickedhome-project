import type { Meta, StoryObj } from "@storybook/react-vite";
import { IngredientStockText } from "@/features/recipes/components/ingredient-stock-text";
import { recipeCheckFixture } from "../fixtures";

const byId = (id: string) => recipeCheckFixture.ingredients.find((item) => item.ingredientId === id)!;

const meta = {
  title: "Features/Recipes/Components/IngredientStockText",
  component: IngredientStockText,
  args: { check: byId("ri-cheese"), variant: "need" },
} satisfies Meta<typeof IngredientStockText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Converted: "Needs 300 g · have 200 g → buy 1 pak". */
export const Default: Story = {};
/** The recipe page: "1 pak (200 g) in stock · buy 1 pak". */
export const StockConverted: Story = { args: { variant: "stock" } };
/** "2 el" against bottles: no number in the wrong unit, a link to set the content per package. */
export const UnknownAmount: Story = { args: { check: byId("ri-oil") } };
export const UnknownAmountStock: Story = { args: { check: byId("ri-oil"), variant: "stock" } };
/** Counted: 2 pcs against 5 onions. */
export const Counted: Story = { args: { check: byId("ri-onion") } };
export const NoProduct: Story = { args: { check: byId("ri-basil") } };
