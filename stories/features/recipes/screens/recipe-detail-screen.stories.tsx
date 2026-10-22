import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipeDetailScreen } from "@/features/recipes/screens/recipe-detail-screen";
import {
  fakeCheck,
  mealPlanFixtures,
  recipeCheckFixture,
  recipeFixture,
  recipeProductsFixture,
  recipeSelectionsFixture,
  recipeShopsFixture,
  stalledCheck,
} from "../fixtures";

const meta = {
  title: "Features/Recipes/Screens/RecipeDetailScreen",
  component: RecipeDetailScreen,
  parameters: { layout: "fullscreen" },
  args: {
    recipe: recipeFixture,
    mealPlan: [],
    check: recipeCheckFixture,
    products: recipeProductsFixture,
    shops: recipeShopsFixture,
    canManage: true,
    loadCheck: fakeCheck,
    initialSelections: recipeSelectionsFixture,
  },
} satisfies Meta<typeof RecipeDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ingredients with a stock dot, the steps, where it came from. */
export const Default: Story = {};
/** The stock check is still loading: grey dots. */
export const Loading: Story = { args: { check: stalledCheck() } };
/** On "To cook" and being cooked: the meal's card on top. */
export const OnTheList: Story = {
  args: { mealPlan: [mealPlanFixtures.cooking] },
};
export const AsChild: Story = { args: { canManage: false } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1" } } };
