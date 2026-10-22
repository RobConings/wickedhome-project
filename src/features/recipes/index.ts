// Public API of the recipes feature. Routes, the app frame and other features import from here only.
//
// - Pages: `RecipesScreen` (/recipes, tabs "To cook" and "All recipes"), `RecipeDetailScreen` (/recipes/:recipeId,
//   with the route composing `<DocumentAttachments entityType="recipe" …>` in its `attachments` slot) and
//   `CookingScreen` (/recipes/cook/:entryId).
// - Server side (for the assistant): src/api/recipes/recipes.service.ts (docs/RECIPES.md lists the functions).
export {
  cookingAction,
  cookingLoader,
  cookingShouldRevalidate,
  recipeAction,
  recipeDetailLoader,
  recipesAction,
  recipesLoader,
} from "./data/recipes-loaders";
export type { CookingPageData, RecipeActionResult, RecipeDetailPageData, RecipesPageData } from "./data/recipes-loaders";
export { fetchMealPlan, fetchRecipe, fetchRecipes } from "./data/recipes-requests";
export { useRecipeSelections } from "./data/use-recipe-selections";
export { CookingScreen } from "./screens/cooking-screen";
export { RecipeDetailScreen } from "./screens/recipe-detail-screen";
export { RecipesScreen } from "./screens/recipes-screen";
export {
  canCook,
  canManageRecipes,
  cookingPath,
  recipePath,
  type CookingState,
  type MealPlanEntry,
  type Recipe,
  type RecipeSummary,
} from "./types/recipes";
