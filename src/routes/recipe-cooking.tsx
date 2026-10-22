import { useLoaderData } from "react-router";
import { useCurrentUser } from "@/features/auth";
import { CookingScreen, canManageRecipes, cookingAction, cookingLoader, cookingShouldRevalidate } from "@/features/recipes";
import { useSamePagePending } from "@/lib/pending";
import { screenHandle } from "@/lib/screen-context";

export const loader = cookingLoader;
export const action = cookingAction;
export const shouldRevalidate = cookingShouldRevalidate;
export const handle = screenHandle<typeof loader>(({ data }) => ({
  kind: "cooking",
  id: data.state.entry.id,
  label: data.state.recipe.name,
}));

export function Component() {
  const user = useCurrentUser();
  const { state, products } = useLoaderData<typeof cookingLoader>();
  const pending = useSamePagePending();
  return <CookingScreen key={state.entry.id} state={state} products={products} canSaveToRecipe={canManageRecipes(user.role)} pending={pending} />;
}
