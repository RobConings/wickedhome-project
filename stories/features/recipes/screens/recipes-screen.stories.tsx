import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecipesScreen } from "@/features/recipes/screens/recipes-screen";
import { mealPlanFixture, recipeCoverFixture, recipeListFixture, recipeProductsFixture, recipeSelectionsFixture, recipeShopsFixture } from "../fixtures";

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
/** Different title lengths, missing/broken covers and statuses share the same card structure. */
export const CardLayout: Story = {
  args: {
    mealPlan: [
      { ...mealPlanFixture[0]!, id: "layout-short", recipeName: "Stoofvlees-friet", imageUrl: recipeCoverFixture },
      { ...mealPlanFixture[1]!, id: "layout-long", recipeName: "Kippenpilons uit de airfryer met frietjes en appelmoes en een uitgebreide huisgemaakte groentesalade", coverFileId: "recipe-cover-preview" },
      { ...mealPlanFixture[2]!, id: "layout-no-cover", recipeName: "Lasagne", openItemCount: 0 },
      { ...mealPlanFixture[1]!, id: "layout-broken", recipeName: "Pom Duchesse met cordon bleu en rauwkost", imageUrl: "/missing-recipe-cover.jpg", addedByName: "Een heel lange naam die de knoppen niet mag verschuiven" },
      { ...mealPlanFixture[2]!, id: "layout-next-row", recipeName: "Boerenworsten met rode kool en puree", imageUrl: recipeCoverFixture },
      { ...mealPlanFixture[3]!, id: "layout-made-short", recipeName: "Tomatensoep", imageUrl: recipeCoverFixture },
      { ...mealPlanFixture[3]!, id: "layout-made-long", recipeName: "Ovenschotel met puree, spruitjes en gehaktballen met een lange omschrijving om de vaste kaarthoogte te tonen" },
    ],
  },
};
