import * as React from "react";
import { CalendarPlusIcon, ChefHatIcon, ExternalLinkIcon, ListOrderedIcon, PencilIcon, PlayIcon, TimerIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Await, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { Card, CardTitle } from "@/components/shared/card";
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { FavoriteToggle } from "@/components/shared/favorite-toggle";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import type { Product } from "@/features/shopping";
import type { Shop } from "@/features/shops";
import type { UseSelectionsOptions } from "@/lib/selections";
import { IngredientProductLink, IngredientShopLink, IngredientThumbnail } from "../components/ingredient-product";
import { IngredientStatusDot } from "../components/ingredient-status-dot";
import { IngredientStockText } from "../components/ingredient-stock-text";
import { MealPlanCard } from "../components/meal-plan-card";
import { RecipeCheckDialog } from "../components/recipe-check-dialog";
import { RecipeCoverChooser } from "../components/recipe-cover-chooser";
import { RecipeFormDialog } from "../components/recipe-form-dialog";
import { RecipeFacts } from "../components/recipe-tile";
import { useAmountText } from "../components/use-amount-text";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { recipeCoverUrl } from "../data/recipe-cover-url";
import { useRecipeSelections } from "../data/use-recipe-selections";
import type { IngredientCheck, MealPlanEntry, Recipe, RecipeCheck, RecipeCategory } from "../types/recipes";
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";
import { BackButton } from "@/components/shared/link-buttons";

type RecipeDetailScreenProps = {
  categories?: RecipeCategory[];
  recipe: Recipe;
  /** This recipe's meals on "To cook". */
  mealPlan: MealPlanEntry[];
  /** Stock per ingredient for the recipe's servings (not awaited by the loader). */
  check: Promise<RecipeCheck> | RecipeCheck;
  products: Product[];
  shops: Shop[];
  canManage: boolean;
  /** Attachments: photos, a scanned page (documents feature), composed by the route. */
  attachments?: React.ReactNode;
  /** Loads the check dialog's data (stories pass a fake). */
  loadCheck?: (recipeId: string, servings: number) => Promise<RecipeCheck>;
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * One recipe: cover, ingredients with a stock dot (in stock / short / unknown), the steps, where it came from.
 * "Add to To cook" checks the stock for a number of people and puts the missing ingredients on the shopping
 * list; "Start cooking" opens the cooking view right away (children too).
 */
export function RecipeDetailScreen({
  recipe,
  categories = [],
  mealPlan,
  check,
  products,
  shops,
  canManage,
  attachments,
  loadCheck,
  initialSelections,
}: RecipeDetailScreenProps) {
  const { t } = useTranslation("recipes");
  const { t: tCommon } = useTranslation();
  const fetcher = useFetcher<RecipeActionResult>();
  const [editing, setEditing] = React.useState(false);
  const { favoriteIds, toggleFavorite } = useRecipeSelections({
    initial: initialSelections,
  });
  const isFavorite = favoriteIds.includes(recipe.id);
  const text = useAmountText();
  const coverUrl = recipeCoverUrl(recipe);

  useFetcherErrorToast(fetcher);

  const cookButton = (fullOnMobile = false) => (
    <Button
      fullOnMobile={fullOnMobile}
      onClick={() => void fetcher.submit({ intent: "cook", id: recipe.id }, { method: "post" })}
      loading={fetcher.formData?.get("intent") === "cook"}
    >
      <PlayIcon />
      {t("detail.startCooking")}
    </Button>
  );

  const actions = (
    <>
      {canManage && (
        <RecipeCheckDialog
          recipe={recipe}
          load={loadCheck}
          trigger={
            <Button variant={mealPlan.length ? "outline" : "default"}>
              <CalendarPlusIcon />
              {t("detail.addToCook")}
            </Button>
          }
        />
      )}
      {!mealPlan.length && cookButton()}
      <FavoriteToggle
        active={isFavorite}
        label={t(isFavorite ? "favorite.remove" : "favorite.add", {
          name: recipe.name,
        })}
        onToggle={() => toggleFavorite(recipe.id).catch(() => toast.error(t("favorite.failed")))}
      />
      {canManage && (
        <Button variant="outline" size="icon" onClick={() => setEditing(true)} aria-label={tCommon("actions.edit")} title={tCommon("actions.edit")}>
          <PencilIcon />
        </Button>
      )}
      {canManage && (
        <DeleteConfirmDialog
          trigger={
            <Button
              variant="outline"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label={tCommon("actions.delete")}
              title={tCommon("actions.delete")}
            >
              <Trash2Icon />
            </Button>
          }
          title={t("delete.title", { name: recipe.name })}
          description={t("delete.description")}
          onConfirm={() => fetcher.submit({ intent: "delete", id: recipe.id }, { method: "post" })}
        />
      )}
    </>
  );

  const ingredientList = (checks: Map<string, IngredientCheck> | null) => (
    <ul className="flex flex-col divide-y">
      {recipe.ingredients.map((ingredient) => {
        const check = checks?.get(ingredient.id);
        const product = ingredient.product;
        return (
          <li key={ingredient.id} className="flex items-start gap-3 py-2.5">
            <IngredientThumbnail product={product} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2">
                {check ? <IngredientStatusDot status={check.status} /> : <span className="size-2.5 animate-pulse rounded-full bg-muted" aria-hidden="true" />}
                <span className="font-medium break-words">{ingredient.name}</span>
                {ingredient.quantity !== null && <span className="text-sm text-muted-foreground tabular-nums">{text.amount(ingredient.quantity, ingredient.unit)}</span>}
                {ingredient.optional && <span className="text-xs text-muted-foreground">{t("ingredients.optionalShort")}</span>}
              </span>
              {ingredient.note && <span className="text-sm break-words text-muted-foreground">{ingredient.note}</span>}
              {product && product.name !== ingredient.name && <IngredientProductLink product={product} className="text-xs" />}
              {check && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  <IngredientStockText check={check} variant="stock" />
                </span>
              )}
            </div>
            {product && product.name === ingredient.name && <IngredientProductLink product={product} className="sr-only" />}
            {product && <IngredientShopLink product={product} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <PageContainer>
      <Stack gap="md">
        <BackButton to="/recipes?tab=all">{t("actions.back")}</BackButton>
        {coverUrl && <img src={coverUrl} alt="" className="h-40 w-full rounded-xl object-cover sm:h-56" />}
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <ChefHatIcon className="size-7 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">{recipe.name}</span>
            </span>
          }
          description={
            <span className="pt-1">
              <RecipeFacts recipe={recipe} />
            </span>
          }
          actions={actions}
        />
      </Stack>
      {canManage && editing && <RecipeFormDialog recipe={recipe} categories={categories} products={products} shops={shops} open={editing} onOpenChange={setEditing} />}

      {mealPlan.length > 0 && (
        <PageGrid columns="cards">
          {mealPlan.map((entry) => (
            <MealPlanCard key={entry.id} entry={entry} canManage={canManage} />
          ))}
        </PageGrid>
      )}

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg">
          <PageSection aria-labelledby="recipe-ingredients">
            <SectionHeader
              id="recipe-ingredients"
              title={
                <span className="flex items-center gap-2">
                  <ChefHatIcon className="size-5 text-primary" aria-hidden="true" />
                  {t("detail.ingredients")}
                </span>
              }
              description={recipe.servings ? t("detail.ingredientsFor", { count: recipe.servings }) : undefined}
            />
            {recipe.ingredients.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noIngredients")}</p>
            ) : (
              <React.Suspense fallback={ingredientList(null)}>
                <Await
                  resolve={check}
                  errorElement={
                    <>
                      <InlineAlert tone="warning">{t("detail.stockFailed")}</InlineAlert>
                      {ingredientList(null)}
                    </>
                  }
                >
                  {(loaded: RecipeCheck) => ingredientList(new Map(loaded.ingredients.map((item) => [item.ingredientId, item])))}
                </Await>
              </React.Suspense>
            )}
          </PageSection>

          <PageSection aria-labelledby="recipe-steps">
            <SectionHeader
              id="recipe-steps"
              title={
                <span className="flex items-center gap-2">
                  <ListOrderedIcon className="size-5 text-primary" aria-hidden="true" />
                  {t("detail.steps")}
                </span>
              }
            />
            {recipe.steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noSteps")}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {recipe.steps.map((step, index) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                      <p className="break-words whitespace-pre-line">{step.text}</p>
                      {step.timerMinutes && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <TimerIcon className="size-3.5" aria-hidden="true" />
                          {t("detail.timer", { count: step.timerMinutes })}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {mealPlan.length === 0 && recipe.steps.length > 0 && <div className="pt-2">{cookButton(true)}</div>}
          </PageSection>
        </Stack>

        <Stack gap="lg">
          <Card>
            <CardTitle>{t("detail.details")}</CardTitle>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{t("fields.category")}</dt>
                <dd>
                  <Link className="text-primary underline-offset-4 hover:underline" to={`/recipes?tab=all&category=${encodeURIComponent(recipe.category?.id ?? "none")}`}>
                    {recipe.category?.name ?? t("categories.uncategorized")}
                  </Link>
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">{t("fields.servings")}</dt>
                <dd className={recipe.servings ? undefined : "text-muted-foreground"}>
                  {recipe.servings ? t("facts.servings", { count: recipe.servings }) : t("detail.noServings")}
                </dd>
              </div>
              {recipe.sourceUrl && (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{t("fields.sourceUrl")}</dt>
                  <dd>
                    <a
                      href={recipe.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
                    >
                      {new URL(recipe.sourceUrl).hostname.replace(/^www\./, "")}
                      <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
              {recipe.notes && (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{t("fields.notes")}</dt>
                  <dd className="break-words whitespace-pre-line">{recipe.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
          <Card>
            <CardTitle>{t("cover.title")}</CardTitle>
            <RecipeCoverChooser recipeId={recipe.id} coverFileId={recipe.coverFileId} canManage={canManage} />
          </Card>
          {attachments}
        </Stack>
      </PageGrid>
    </PageContainer>
  );
}
