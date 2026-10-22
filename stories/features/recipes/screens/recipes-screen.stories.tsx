import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipesScreen } from "@/features/recipes/screens/recipes-screen";
import { mealPlanFixture, recipeListFixture, recipeProductsFixture, recipeSelectionsFixture, recipeShopsFixture } from "../fixtures";

const meta = {
  title: "Features/Recipes/Screens/RecipesScreen",
  component: RecipesScreen,
  parameters: { layout: "fullscreen" },
  args: {
    recipes: recipeListFixture,
    mealPlan: mealPlanFixture,
    products: recipeProductsFixture,
    shops: recipeShopsFixture,
    canManage: true,
    initialSelections: recipeSelectionsFixture,
  },
} satisfies Meta<typeof RecipesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** "To cook": being cooked first, then waiting, then made lately. */
export const Default: Story = {};
export const AllRecipes: Story = {
  parameters: { router: { initialEntries: ["/?tab=all"] } },
};
export const WithCategories: Story = {
  parameters: { router: { initialEntries: ["/?tab=all"] } },
  args: {
    categories: [{ id: "cat-main", name: "Hoofdgerechten", recipeCount: 3 }, { id: "cat-soup", name: "Soep", recipeCount: 1 }],
    recipes: recipeListFixture.map((recipe, index) => ({ ...recipe, category: index === 3 ? { id: "cat-soup", name: "Soep" } : { id: "cat-main", name: "Hoofdgerechten" } })),
  },
};
export const CategoryFilter: Story = {
  ...WithCategories,
  parameters: { router: { initialEntries: ["/?tab=all&category=cat-soup"] } },
};
export const Loading: Story = { args: { loading: true } };
export const Empty: Story = { args: { recipes: [], mealPlan: [] } };
export const NothingToCook: Story = { args: { mealPlan: [] } };
/** Children cook, but don't add recipes or take meals off the list. */
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
