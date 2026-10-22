import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { DocumentAttachments, canManageDocuments } from "@/features/documents";
import { RecipeDetailScreen, canManageRecipes, recipeAction, recipeDetailLoader } from "@/features/recipes";
import { screenHandle } from "./lib/screen-context";

export const loader = recipeDetailLoader;
export const action = recipeAction;
export const handle = screenHandle<typeof loader>(({ data }) => ({
  kind: "recipe",
  id: data.recipe.id,
  label: data.recipe.name,
}));

/** A recipe's page: the recipes feature draws it; the attachments (photos, a scanned page) come from documents. */
export function Component() {
  const user = useCurrentUser();
  const { recipe, mealPlan, categories, check, products, shops } = useLoaderData<typeof recipeDetailLoader>();
  return (
    <RecipeDetailScreen
      key={recipe.id}
      recipe={recipe}
      categories={categories}
      mealPlan={mealPlan}
      check={check}
      products={products}
      shops={shops}
      canManage={canManageRecipes(user.role)}
      attachments={
        <DocumentAttachments key={`documents-${recipe.id}`} entityType="recipe" entityId={recipe.id} canManage={canManageDocuments(user.role)} />
      }
    />
  );
}
