import { api } from "@/lib/api-client";
import type {
  CookRecipeInput,
  CookUseResult,
  CookingState,
  MealPlanEntry,
  MealPlanExtraInput,
  MealPlanInput,
  MealPlanUseInput,
  PlanResult,
  Recipe,
  RecipeCategory,
  RecipeCategoryInput,
  RecipeCheck,
  RecipeCoverInput,
  RecipeInput,
  RecipeSummary,
} from "../types/recipes";

const path = (id: string) => `/recipes/${encodeURIComponent(id)}`;
const entryPath = (id: string) => `/recipes/meal-plan/${encodeURIComponent(id)}`;

export const fetchRecipes = (q?: string, categoryId?: string) => {
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(categoryId ? { categoryId } : {}) });
  return api.get<RecipeSummary[]>(`/recipes${params.size ? `?${params}` : ""}`);
};
export const fetchRecipeCategories = () => api.get<RecipeCategory[]>("/recipes/categories");
export const createRecipeCategory = (input: RecipeCategoryInput) => api.post<RecipeCategory>("/recipes/categories", input);
export const updateRecipeCategory = (id: string, input: RecipeCategoryInput) => api.put<RecipeCategory>(`/recipes/categories/${encodeURIComponent(id)}`, input);
export const deleteRecipeCategory = (id: string) => api.delete(`/recipes/categories/${encodeURIComponent(id)}`);
export const fetchRecipe = (id: string) => api.get<Recipe>(path(id));
export const createRecipe = (input: RecipeInput) => api.post<Recipe>("/recipes", input);
export const updateRecipe = (id: string, input: RecipeInput) => api.put<Recipe>(path(id), input);
export const deleteRecipe = (id: string) => api.delete(path(id));
export const setRecipeCover = (id: string, input: RecipeCoverInput) => api.put<Recipe>(`${path(id)}/cover`, input);
/** Per ingredient: needed for `servings`, stock, shortfall and whether it's on a list already. */
export const checkRecipe = (id: string, servings?: number) => api.get<RecipeCheck>(`${path(id)}/check${servings ? `?servings=${servings}` : ""}`);
/** Start cooking from the recipe: continues or creates its meal on "To cook". */
export const cookRecipe = (id: string, input: CookRecipeInput = {}) => api.post<CookingState>(`${path(id)}/cook`, input);

/** "To cook"; `cooked` adds the meals made in the last two weeks. */
export const fetchMealPlan = (cooked = false) => api.get<MealPlanEntry[]>(`/recipes/meal-plan${cooked ? "?cooked=1" : ""}`);
export const planMeal = (input: MealPlanInput) => api.post<PlanResult>("/recipes/meal-plan", input);
export const deleteMealPlanEntry = (id: string, removeItems: boolean) =>
  api.delete<{ removedItems: number }>(`${entryPath(id)}${removeItems ? "?removeItems=1" : ""}`);
export const fetchCookingState = (id: string) => api.get<CookingState>(entryPath(id));
export const startCooking = (id: string) => api.post<CookingState>(`${entryPath(id)}/start`);
export const useIngredient = (id: string, input: MealPlanUseInput) => api.post<CookUseResult>(`${entryPath(id)}/use`, input);
export const undoUsage = (id: string, usageId: string) => api.delete<CookingState>(`${entryPath(id)}/use/${encodeURIComponent(usageId)}`);
export const addExtra = (id: string, input: MealPlanExtraInput) => api.post<CookingState>(`${entryPath(id)}/extras`, input);
export const setCookingStep = (id: string, step: number) => api.put<CookingState>(`${entryPath(id)}/step`, { step });
export const markCooked = (id: string) => api.post<CookingState>(`${entryPath(id)}/cooked`);
