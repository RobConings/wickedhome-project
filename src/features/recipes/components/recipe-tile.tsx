import { ChefHatIcon, ListOrderedIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/ui/badge";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { recipeCoverUrl } from "../data/recipe-cover-url";
import { recipePath, type RecipeSummary } from "../types/recipes";

type RecipeCardProps = {
  recipe: RecipeSummary;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
};

/** Servings, ingredients and steps as small facts ("4 people · 8 ingredients · 5 steps"). */
export function RecipeFacts({ recipe }: { recipe: Pick<RecipeSummary, "servings" | "ingredientCount" | "stepCount"> }) {
  const { t } = useTranslation("recipes");
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {recipe.servings && (
        <span className="flex items-center gap-1">
          <UsersIcon className="size-3.5" aria-hidden="true" />
          {t("facts.servings", { count: recipe.servings })}
        </span>
      )}
      <span className="flex items-center gap-1">
        <ChefHatIcon className="size-3.5" aria-hidden="true" />
        {t("facts.ingredients", { count: recipe.ingredientCount })}
      </span>
      {recipe.stepCount > 0 && (
        <span className="flex items-center gap-1">
          <ListOrderedIcon className="size-3.5" aria-hidden="true" />
          {t("facts.steps", { count: recipe.stepCount })}
        </span>
      )}
    </span>
  );
}

/** A recipe as a tile: cover photo (or a band), name (opens the recipe), facts and a star. */
export function RecipeTile({ recipe, isFavorite, onToggleFavorite }: RecipeCardProps) {
  const { t } = useTranslation("recipes");
  const coverUrl = recipeCoverUrl(recipe);
  return (
    <Card className="relative gap-3 overflow-hidden p-0 has-[a:hover]:bg-accent/30">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="h-28 w-full object-cover" loading="lazy" />
      ) : (
        <div className="grid h-16 w-full place-items-center bg-primary/10 text-primary" aria-hidden="true">
          <ChefHatIcon className="size-6" />
        </div>
      )}
      <div className="flex items-start gap-2 px-4 pb-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            to={recipePath(recipe.id)}
            className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {recipe.name}
          </Link>
          {recipe.category && <Badge variant="secondary" className="max-w-full self-start whitespace-normal break-words">{recipe.category.name}</Badge>}
          <RecipeFacts recipe={recipe} />
        </div>
        <FavoriteToggle
          className="relative z-10 -mr-1"
          active={isFavorite}
          label={t(isFavorite ? "favorite.remove" : "favorite.add", {
            name: recipe.name,
          })}
          onToggle={() => onToggleFavorite(recipe.id)}
        />
      </div>
    </Card>
  );
}

/** One row in the recipes list (the list draws the dividers): thumbnail, name, facts, star. */
export function RecipeListItem({ recipe, isFavorite, onToggleFavorite }: RecipeCardProps) {
  const { t } = useTranslation("recipes");
  const coverUrl = recipeCoverUrl(recipe);
  return (
    <div className="relative flex items-center gap-3">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <ChefHatIcon className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          to={recipePath(recipe.id)}
          className="font-medium break-words outline-none after:absolute after:inset-0 hover:underline focus-visible:underline"
        >
          {recipe.name}
        </Link>
        {recipe.category && <span className="text-xs text-muted-foreground">{recipe.category.name}</span>}
        <RecipeFacts recipe={recipe} />
      </div>
      <FavoriteToggle
        className="relative z-10"
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", {
          name: recipe.name,
        })}
        onToggle={() => onToggleFavorite(recipe.id)}
      />
    </div>
  );
}
