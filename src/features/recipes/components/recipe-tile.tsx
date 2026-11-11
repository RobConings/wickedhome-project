import { RecordImage } from "@/components/shared/record-image";
import { ChefHatIcon, ListOrderedIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Card } from "@/components/shared/card";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { recipeCoverUrl } from "../data/recipe-cover-url";
import { recipePath, type RecipeSummary } from "../types/recipes";
import { RecipeCardCover, RecipeCardStat, RecipeCardTitle } from "./recipe-card-content";

type RecipeCardProps = {
  recipe: RecipeSummary;
  isFavorite: boolean;
  /** May return a promise: the star then shows its new state until the save settles. */
  onToggleFavorite: (id: string) => void | Promise<unknown>;
};

/** Labelled facts for detail/list views; cards use compact icon-and-number facts. */
export function RecipeFacts({ recipe, compact = false }: { recipe: Pick<RecipeSummary, "servings" | "ingredientCount" | "stepCount">; compact?: boolean }) {
  const { t } = useTranslation("recipes");
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {recipe.servings && (
        <RecipeCardStat icon={UsersIcon} label={t("facts.servings", { count: recipe.servings })}>{compact ? recipe.servings : t("facts.servings", { count: recipe.servings })}</RecipeCardStat>
      )}
      <RecipeCardStat icon={ChefHatIcon} label={t("facts.ingredients", { count: recipe.ingredientCount })}>{compact ? recipe.ingredientCount : t("facts.ingredients", { count: recipe.ingredientCount })}</RecipeCardStat>
      {recipe.stepCount > 0 && (
        <RecipeCardStat icon={ListOrderedIcon} label={t("facts.steps", { count: recipe.stepCount })}>{compact ? recipe.stepCount : t("facts.steps", { count: recipe.stepCount })}</RecipeCardStat>
      )}
    </span>
  );
}

/** A recipe as a tile: shared banner, bounded title, compact facts and a star. */
export function RecipeTile({ recipe, isFavorite, onToggleFavorite }: RecipeCardProps) {
  const { t } = useTranslation("recipes");
  const coverUrl = recipeCoverUrl(recipe);
  return (
    <Card className="relative h-full gap-0 overflow-hidden p-0 has-[a:hover]:bg-accent/30">
      <RecipeCardCover src={coverUrl} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <RecipeCardTitle name={recipe.name} to={recipePath(recipe.id)} stretched />
        {recipe.category && <span className="sr-only">{recipe.category.name}</span>}
        <div className="mt-auto"><RecipeFacts recipe={recipe} compact /></div>
      </div>
      <div className="absolute top-2 right-2 rounded-full bg-card/90">
        <FavoriteToggle
          className="relative z-10"
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
        <RecordImage src={coverUrl} shape="avatar" fallback={<ChefHatIcon className="size-7 text-section" />} />
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
