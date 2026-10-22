import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from "react-router";
import { fetchProducts, handleProductForm, type Product } from "@/features/shopping";
import { fetchShops, type Shop } from "@/features/shops";
import { ApiRequestError } from "@/lib/api-client";
import { formDataToObject, parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  cookingPath,
  mealPlanExtraFormSchema,
  mealPlanInputSchema,
  mealPlanStepInputSchema,
  mealPlanUseInputSchema,
  recipeFormSchema,
  recipeCategoryInputSchema,
  type RecipeCategory,
  type CookingState,
  type MealPlanEntry,
  type Recipe,
  type RecipeCheck,
  type RecipeSummary,
} from "../types/recipes";
import {
  addExtra,
  createRecipeCategory,
  updateRecipeCategory,
  deleteRecipeCategory,
  fetchRecipeCategories,
  checkRecipe,
  cookRecipe,
  createRecipe,
  deleteMealPlanEntry,
  deleteRecipe,
  fetchCookingState,
  fetchMealPlan,
  fetchRecipe,
  fetchRecipes,
  markCooked,
  planMeal,
  setCookingStep,
  setRecipeCover,
  startCooking,
  undoUsage,
  updateRecipe,
  useIngredient,
} from "./recipes-requests";

export const RECIPE_INTENTS = [
  "create",
  "update",
  "delete",
  "cover",
  "plan",
  "cook",
  "start",
  "done",
  "remove-entry",
  "use",
  "undo",
  "extra",
  "step",
  "create-category",
  "update-category",
  "delete-category",
] as const;
export type RecipeIntent = (typeof RECIPE_INTENTS)[number];

export type RecipeActionResult = FormResult & {
  categoryId?: string;
  intent?: RecipeIntent | string;
  recipeId?: string;
  entryId?: string;
  /** `use`: the tap, for "Undo". */
  usageId?: string;
  /** `use`: the product dropped below its minimum and went on the shopping list. */
  addedToShoppingList?: boolean;
  /** `plan`: items added and items merged into ones already on a list. */
  added?: number;
  merged?: number;
  /** `remove-entry`: shopping items removed with it. */
  removedItems?: number;
  /** Product forms (`create-product`): the new product. */
  id?: string;
};

export type RecipesPageData = {
  categories: RecipeCategory[];
  recipes: RecipeSummary[];
  mealPlan: MealPlanEntry[];
  products: Product[];
  shops: Shop[];
};
export type RecipeDetailPageData = {
  categories: RecipeCategory[];
  recipe: Recipe;
  mealPlan: MealPlanEntry[];
  products: Product[];
  shops: Shop[];
  /** Stock per ingredient for the recipe's servings: slow (one stock read per product), so not awaited. */
  check: Promise<RecipeCheck>;
};
export type CookingPageData = {
  state: CookingState;
  products: Product[];
  shops: Shop[];
};

const products = () => fetchProducts().catch(() => [] as Product[]);
const shops = () => fetchShops().catch(() => [] as Shop[]);

const notFoundAs404 = (error: unknown): never => {
  if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
  throw error;
};

export async function recipesLoader(): Promise<RecipesPageData> {
  const [recipes, mealPlan, categories, productList, shopList] = await Promise.all([fetchRecipes(), fetchMealPlan(true), fetchRecipeCategories(), products(), shops()]);
  return { recipes, mealPlan, categories, products: productList, shops: shopList };
}

export async function recipeDetailLoader({ params }: LoaderFunctionArgs): Promise<RecipeDetailPageData> {
  const id = params.recipeId ?? "";
  try {
    const [recipe, mealPlan, categories, productList, shopList] = await Promise.all([fetchRecipe(id), fetchMealPlan(), fetchRecipeCategories(), products(), shops()]);
    const check = checkRecipe(id);
    // Shown by an <Await> with its own error state; never an unhandled rejection.
    check.catch(() => undefined);
    return {
      recipe,
      categories,
      mealPlan: mealPlan.filter((entry) => entry.recipeId === id),
      products: productList,
      shops: shopList,
      check,
    };
  } catch (error) {
    return notFoundAs404(error);
  }
}

export async function cookingLoader({ params }: LoaderFunctionArgs): Promise<CookingPageData> {
  try {
    const [state, productList, shopList] = await Promise.all([fetchCookingState(params.entryId ?? ""), products(), shops()]);
    return { state, products: productList, shops: shopList };
  } catch (error) {
    return notFoundAs404(error);
  }
}

/** The cooking page doesn't reload for a step change (it keeps the step itself); everything else does. */
export function cookingShouldRevalidate({ formData, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formData?.get("intent") === "step") return false;
  return defaultShouldRevalidate;
}

const bool = (value: unknown) => value === "on" || value === "true" || value === "1";

/**
 * One action for the recipes pages; the form's `intent` says what to do. Recipe intents (`create`, `update`,
 * `delete`, `cover`), planning (`plan` with `items` as JSON, `remove-entry`), cooking (`start`, `cook`, `use`,
 * `undo`, `extra`, `step`, `done`) and the inline product form (`create-product`, `update-product`).
 */
export async function handleRecipeForm(formData: FormData): Promise<RecipeActionResult> {
  const intent = String(formData.get("intent") ?? "create");
  const id = String(formData.get("id") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const values = formDataToObject(formData);

  try {
    switch (intent) {
      case "create-category":
      case "update-category": {
        const { data: input, errors } = parseForm(recipeCategoryInputSchema, formData);
        if (errors) return { errors, intent };
        const category = intent === "create-category" ? await createRecipeCategory(input) : await updateRecipeCategory(id, input);
        return { ok: true, intent, categoryId: category.id };
      }
      case "delete-category":
        await deleteRecipeCategory(id);
        return { ok: true, intent, categoryId: id };
      case "create":
      case "update": {
        const { data: input, errors } = parseForm(recipeFormSchema, formData);
        if (errors) return { errors, intent };
        const recipe = intent === "create" ? await createRecipe(input) : await updateRecipe(id, input);
        return { ok: true, intent, recipeId: recipe.id };
      }
      case "delete":
        await deleteRecipe(id);
        return { ok: true, intent, recipeId: id };
      case "cover":
        await setRecipeCover(id, {
          fileId: typeof values.fileId === "string" ? values.fileId : null,
        });
        return { ok: true, intent, recipeId: id };
      case "plan": {
        const parsed = mealPlanInputSchema.safeParse({
          recipeId: id,
          servings: values.servings,
          items: JSON.parse(String(values.items ?? "[]")) as unknown,
        });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        const result = await planMeal(parsed.data);
        return {
          ok: true,
          intent,
          recipeId: id,
          entryId: result.entry.id,
          added: result.added,
          merged: result.merged,
        };
      }
      case "remove-entry": {
        const result = await deleteMealPlanEntry(entryId, bool(values.removeItems));
        return { ok: true, intent, entryId, removedItems: result.removedItems };
      }
      case "cook": {
        const state = await cookRecipe(id, {
          servings: values.servings ? Number(values.servings) : null,
        });
        return { ok: true, intent, recipeId: id, entryId: state.entry.id };
      }
      case "start":
        await startCooking(entryId);
        return { ok: true, intent, entryId };
      case "done":
        await markCooked(entryId);
        return { ok: true, intent, entryId };
      case "use": {
        const parsed = mealPlanUseInputSchema.safeParse({
          ingredientId: values.ingredientId,
          extraId: values.extraId,
          productId: values.productId,
          quantity: values.quantity,
        });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        const result = await useIngredient(entryId, parsed.data);
        return {
          ok: true,
          intent,
          entryId,
          usageId: result.usageId,
          addedToShoppingList: result.addedToShoppingList,
        };
      }
      case "undo":
        await undoUsage(entryId, String(values.usageId ?? ""));
        return { ok: true, intent, entryId };
      case "extra": {
        const { data: input, errors } = parseForm(mealPlanExtraFormSchema, formData);
        if (errors) return { errors, intent };
        await addExtra(entryId, input);
        return { ok: true, intent, entryId };
      }
      case "step": {
        const parsed = mealPlanStepInputSchema.safeParse({ step: values.step });
        if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
        await setCookingStep(entryId, parsed.data.step);
        return { ok: true, intent, entryId };
      }
      case "create-product":
      case "update-product":
        return await handleProductForm(formData);
      default:
        return { formError: i18n.t("common:errors.generic"), intent };
    }
  } catch (error) {
    return {
      ...toFormResult(error, {
        not_found: i18n.t("recipes:errors.notFound"),
        forbidden: i18n.t("recipes:errors.forbidden"),
        conflict: i18n.t("recipes:errors.alreadyCooked"),
      }),
      intent,
    };
  }
}

/** "To cook" + all recipes: starting a meal opens the cooking view. */
export async function recipesAction({ request }: ActionFunctionArgs) {
  const result = await handleRecipeForm(await request.formData());
  if (result.ok && (result.intent === "start" || result.intent === "cook") && result.entryId) return redirect(cookingPath(result.entryId));
  return result;
}

/** A recipe's page: the same, but deleting goes back to the list. */
export async function recipeAction({ request }: ActionFunctionArgs) {
  const result = await handleRecipeForm(await request.formData());
  if (result.ok && result.intent === "delete") return redirect("/recipes");
  if (result.ok && (result.intent === "start" || result.intent === "cook") && result.entryId) return redirect(cookingPath(result.entryId));
  return result;
}

/** The cooking view. */
export async function cookingAction({ request }: ActionFunctionArgs) {
  return handleRecipeForm(await request.formData());
}
