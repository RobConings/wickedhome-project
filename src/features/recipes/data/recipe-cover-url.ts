import { documentContentUrl } from "@/features/documents";
import type { RecipeSummary } from "../types/recipes";

/** A deliberately chosen upload takes precedence over the original source photo. */
export const recipeCoverUrl = (recipe: Pick<RecipeSummary, "coverFileId" | "imageUrl">): string | null =>
  recipe.coverFileId ? documentContentUrl(recipe.coverFileId) : recipe.imageUrl;
