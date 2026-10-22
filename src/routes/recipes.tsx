import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { RecipesScreen, canManageRecipes, recipesAction, recipesLoader } from "@/features/recipes";
import { screenHandle } from "./lib/screen-context";

export const loader = recipesLoader;
export const action = recipesAction;
export const handle = screenHandle(({ t }) => ({
  kind: "recipes",
  label: t("nav.recipes"),
}));

export function Component() {
  const user = useCurrentUser();
  const { recipes, mealPlan, categories, products, shops } = useLoaderData<typeof recipesLoader>();
  return <RecipesScreen recipes={recipes} mealPlan={mealPlan} categories={categories} products={products} shops={shops} canManage={canManageRecipes(user.role)} />;
}
