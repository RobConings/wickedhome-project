import * as React from "react";
import { BookOpenIcon, ChefHatIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PendingContent, SkeletonTiles } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import type { Product } from "@/features/shopping";
import type { Shop } from "@/features/shops";
import { useOpenFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import type { UseSelectionsOptions } from "@/lib/selections";
import { MealPlanCard } from "../components/meal-plan-card";
import { RecipeFormDialog } from "../components/recipe-form-dialog";
import { RecipeCategoriesDialog } from "../components/recipe-categories-dialog";
import { RecipeListItem, RecipeTile } from "../components/recipe-tile";
import { useRecipeSelections } from "../data/use-recipe-selections";
import { filterRecipesByCategory, recipePath, type MealPlanEntry, type RecipeSummary, type RecipeCategory } from "../types/recipes";

type RecipesScreenProps = {
  categories?: RecipeCategory[];
  recipes: RecipeSummary[];
  /** Waiting and being cooked, plus the meals made in the last two weeks. */
  mealPlan: MealPlanEntry[];
  /** For the recipe form. */
  products: Product[];
  shops: Shop[];
  /** Owners and adults add recipes and take meals off the list; everyone cooks. */
  canManage: boolean;
  /** Loading the page's data for the first time (stories). */
  loading?: boolean;
  /** Seed favourites instead of fetching them (stories). */
  initialSelections?: UseSelectionsOptions["initial"];
};

const TABS = ["cook", "all"] as const;
type Tab = (typeof TABS)[number];
const FAVORITES_GROUP = "\u0000favorites";
const ALL_GROUP = "all";

/**
 * Recipes, two tabs. "To cook": the meals put on the list, being cooked first, with Start / Continue and Done
 * (and the meals made lately). "All recipes": every recipe as a list or tiles with search (name and
 * ingredients), favourites on top. "New recipe" opens the form (also from `?new=1`).
 */
export function RecipesScreen({ recipes, mealPlan, categories = [], products, shops, canManage, loading = false, initialSelections }: RecipesScreenProps) {
  const { t } = useTranslation("recipes");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { favoriteIds, toggleFavorite } = useRecipeSelections({
    initial: initialSelections,
  });
  const [creating, setCreating] = useOpenFromUrl(canManage);
  const pending = useSamePagePending();
  const requestedCategory = searchParams.get("category");
  const categoryId = requestedCategory === "none" || categories.some((category) => category.id === requestedCategory) ? requestedCategory : undefined;
  const visibleRecipes = filterRecipesByCategory(recipes, categoryId ?? undefined);
  const setCategory = (value: string) => setSearchParams((params) => {
    if (value === "all") params.delete("category");
    else params.set("category", value);
    return params;
  }, { replace: true, preventScrollReset: true });

  const waiting = mealPlan.filter((entry) => entry.status !== "cooked");
  const made = mealPlan.filter((entry) => entry.status === "cooked");
  const requested = searchParams.get("tab");
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : waiting.length ? "cook" : "all";
  const setTab = (next: string) =>
    setSearchParams(
      (params) => {
        params.set("tab", next);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  const handleToggleFavorite = (id: string) => toggleFavorite(id).catch(() => toast.error(t("favorite.failed")));
  const groupOrder = React.useMemo(() => [FAVORITES_GROUP, ALL_GROUP], []);

  const addButton = canManage && (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon />
      {t("actions.add")}
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={canManage ? <><RecipeCategoriesDialog categories={categories} />{addButton}</> : undefined} />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="cook">{waiting.length ? t("tabs.cookCount", { count: waiting.length }) : t("tabs.cook")}</TabsTrigger>
          <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
        </TabsList>

        <TabsContent value="cook" className="flex flex-col gap-6">
          {loading ? (
            <SkeletonTiles count={2} />
          ) : (
            <PendingContent pending={pending} label={t("toCook.loading")}>
              {waiting.length === 0 ? (
                <EmptyState
                  icon={ChefHatIcon}
                  title={t("toCook.emptyTitle")}
                  description={t("toCook.emptyDescription")}
                  action={
                    recipes.length > 0 && (
                      <Button variant="outline" onClick={() => setTab("all")}>
                        <BookOpenIcon />
                        {t("toCook.pickRecipe")}
                      </Button>
                    )
                  }
                />
              ) : (
                <PageGrid columns="cards">
                  {waiting.map((entry) => (
                    <MealPlanCard key={entry.id} entry={entry} canManage={canManage} />
                  ))}
                </PageGrid>
              )}
              {made.length > 0 && (
                <section aria-labelledby="recently-made" className="flex flex-col gap-3 pt-6">
                  <h2 id="recently-made" className="text-lg font-semibold">
                    {t("toCook.recentlyMade")}
                  </h2>
                  <PageGrid columns="cards">
                    {made.map((entry) => (
                      <MealPlanCard key={entry.id} entry={entry} canManage={canManage} />
                    ))}
                  </PageGrid>
                </section>
              )}
            </PendingContent>
          )}
        </TabsContent>

        <TabsContent value="all">
          <GeneralList
            label={t("tabs.all")}
            items={visibleRecipes}
            filtered={Boolean(categoryId)}
            toolbar={
              <Select value={categoryId ?? "all"} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-72" aria-label={t("fields.category")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("categories.all")} ({recipes.length})</SelectItem>
                  <SelectItem value="none">{t("categories.uncategorized")} ({recipes.filter((recipe) => !recipe.category).length})</SelectItem>
                  {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} ({category.recipeCount})</SelectItem>)}
                </SelectContent>
              </Select>
            }
            getKey={(recipe) => recipe.id}
            renderRow={(recipe) => (
              <RecipeListItem recipe={recipe} isFavorite={favoriteIds.includes(recipe.id)} onToggleFavorite={handleToggleFavorite} />
            )}
            renderTile={(recipe) => (
              <RecipeTile recipe={recipe} isFavorite={favoriteIds.includes(recipe.id)} onToggleFavorite={handleToggleFavorite} />
            )}
            search={{
              keys: (recipe) => [recipe.name, recipe.category?.name, ...recipe.ingredientNames],
              label: t("filter.search"),
              placeholder: t("filter.search"),
            }}
            storageKey="recipes"
            defaultView="tiles"
            loading={loading}
            pending={pending}
            groupBy={(recipe) => (favoriteIds.includes(recipe.id) ? [FAVORITES_GROUP, ALL_GROUP] : ALL_GROUP)}
            groupOrder={groupOrder}
            renderGroupHeader={(key, list) => (
              <span className="flex items-center gap-2">
                {key === FAVORITES_GROUP ? t("groups.favorites") : t("groups.all")}
                <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
              </span>
            )}
            emptyState={<EmptyState icon={BookOpenIcon} title={t("empty.title")} description={t("empty.description")} action={addButton} />}
          />
        </TabsContent>
      </Tabs>

      {canManage && (
        <RecipeFormDialog
          categories={categories}
          products={products}
          shops={shops}
          open={creating}
          onOpenChange={setCreating}
          onSaved={(result) => result.intent === "create" && result.recipeId && navigate(recipePath(result.recipeId))}
        />
      )}
    </PageContainer>
  );
}
