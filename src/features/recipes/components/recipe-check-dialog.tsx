import * as React from "react";
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InlineAlert } from "./inline-alert";
import { SkeletonList } from "./loading-state";
import { cn } from "@/lib/utils";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { checkRecipe } from "../data/recipes-requests";
import type { IngredientCheck, Recipe, RecipeCheck } from "../types/recipes";
import { IngredientProductLink, IngredientShopLink, IngredientThumbnail } from "./ingredient-product";
import { IngredientStatusDot } from "./ingredient-status-dot";
import { IngredientStockText } from "./ingredient-stock-text";
import { useAmountText } from "./use-amount-text";

type RecipeCheckDialogProps = {
  recipe: Pick<Recipe, "id" | "name" | "servings">;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Route to post to (default: the current route). */
  action?: string;
  /** Loads the check; defaults to the API (stories pass a fake). */
  load?: (recipeId: string, servings: number) => Promise<RecipeCheck>;
};

/** Missing ingredients are ticked to buy; in stock, already on a list, optional and unknown ones aren't. */
const defaultPick = (ingredient: IngredientCheck) => ingredient.status === "short" && !ingredient.onList && !ingredient.optional;

/**
 * What goes on the list when ticked: a product in whole packages (the packages missing, or what the need
 * takes; 1 when the units don't convert); a free-text ingredient with the recipe's amount.
 */
const toBuyOf = (ingredient: IngredientCheck) =>
  ingredient.product
    ? Math.max(1, Math.ceil(ingredient.shortfallPackages || ingredient.neededInStockUnits || 1))
    : ingredient.needed;

/**
 * "Add to To cook": choose for how many, see per ingredient what's in stock (shared stock of alternatives
 * counts), tick what to buy (missing ones are ticked), then the meal goes on "To cook" and the ticked ones on
 * the shopping list. An item already on the list gets more instead of a second line.
 */
export function RecipeCheckDialog({ recipe, trigger, open: controlledOpen, onOpenChange, action, load = checkRecipe }: RecipeCheckDialogProps) {
  const { t } = useTranslation("recipes");
  const { t: tCommon } = useTranslation();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [servings, setServings] = React.useState(recipe.servings ?? 2);
  const [check, setCheck] = React.useState<RecipeCheck | null>(null);
  // The servings whose check failed to load (a newer servings value tries again).
  const [failedFor, setFailedFor] = React.useState<number | null>(null);
  const failed = failedFor === servings;
  const [picked, setPicked] = React.useState<ReadonlySet<string> | null>(null);
  const fetcher = useFetcher<RecipeActionResult>();
  const busy = fetcher.state !== "idle";

  const setOpen = (next: boolean) => {
    if (!next && busy) return;
    // Every opening starts fresh: a new check, missing ones ticked again.
    if (!next) {
      setPicked(null);
      setCheck(null);
    }
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // Load on opening and for every servings change (keeps showing the previous check while it refreshes).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      load(recipe.id, servings)
        .then((next) => {
          if (cancelled) return;
          setCheck(next);
          setPicked((previous) => previous ?? new Set(next.ingredients.filter(defaultPick).map((ingredient) => ingredient.ingredientId)));
        })
        .catch(() => !cancelled && setFailedFor(servings));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, recipe.id, servings, load]);

  // Closing after a save goes through a ref (kept current by an effect), like GeneralForm's callbacks.
  const close = React.useRef(() => undefined as void);
  React.useEffect(() => {
    close.current = () => setOpen(false);
  });
  const handled = React.useRef<RecipeActionResult | undefined>(undefined);
  React.useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.ok && fetcher.data.intent === "plan") {
      const items = (fetcher.data.added ?? 0) + (fetcher.data.merged ?? 0);
      toast.success(items ? t("check.planned", { count: items }) : t("check.plannedNoItems"));
      close.current();
    } else if (fetcher.data.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data, t]);

  const selected = picked ?? new Set<string>();
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const text = useAmountText();

  const submit = () => {
    if (!check) return;
    const items = check.ingredients
      .filter((ingredient) => selected.has(ingredient.ingredientId))
      .map((ingredient) => ({
        ingredientId: ingredient.ingredientId,
        quantity: toBuyOf(ingredient),
      }));
    void fetcher.submit(
      {
        intent: "plan",
        id: recipe.id,
        servings: String(servings),
        items: JSON.stringify(items),
      },
      { method: "post", action },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("check.title", { name: recipe.name })}</DialogTitle>
          <DialogDescription>{t("check.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium" id={`servings-${recipe.id}`}>
            {t("check.servings")}
          </span>
          <div className="flex items-center gap-2" role="group" aria-labelledby={`servings-${recipe.id}`}>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setServings((value) => Math.max(1, value - 1))}
              disabled={servings <= 1 || busy}
              aria-label={t("check.fewer")}
            >
              <MinusIcon />
            </Button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
              {servings}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setServings((value) => Math.min(100, value + 1))}
              disabled={servings >= 100 || busy}
              aria-label={t("check.more")}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>

        {failed && !check && <InlineAlert tone="error">{t("check.failed")}</InlineAlert>}
        {!check && !failed && <SkeletonList rows={4} />}
        {check && check.ingredients.length === 0 && <p className="text-sm text-muted-foreground">{t("check.noIngredients")}</p>}
        {check && check.ingredients.length > 0 && (
          <ul
            className={cn("flex flex-col divide-y rounded-lg border", check.servings !== servings && "opacity-60")}
            aria-busy={check.servings !== servings}
          >
            {check.ingredients.map((ingredient) => {
              const on = selected.has(ingredient.ingredientId);
              const toBuy = toBuyOf(ingredient);
              const product = ingredient.product;
              return (
                <li key={ingredient.ingredientId} className="flex items-start gap-3 p-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={t("check.buy", { name: ingredient.name })}
                    onClick={() => toggle(ingredient.ingredientId)}
                    disabled={busy}
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-5",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {on && <CheckIcon aria-hidden="true" />}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <IngredientStatusDot status={ingredient.status} />
                      <span className="font-medium break-words">{ingredient.name}</span>
                      {ingredient.optional && <span className="text-xs text-muted-foreground">{t("ingredients.optionalShort")}</span>}
                      {ingredient.onList && <Badge variant="secondary">{t("check.onList")}</Badge>}
                    </span>
                    {product && product.name !== ingredient.name && <IngredientProductLink product={product} className="text-xs" />}
                    <span className="text-sm text-muted-foreground tabular-nums">
                      <IngredientStockText check={ingredient} variant="need" />
                    </span>
                    {on && (
                      <span className="text-sm font-medium tabular-nums">
                        {t("check.toBuy", { amount: product ? text.stockUnits(toBuy, product) : text.amount(toBuy, ingredient.unit) })}
                      </span>
                    )}
                    {ingredient.note && <span className="text-xs break-words text-muted-foreground">{ingredient.note}</span>}
                  </div>
                  {product && <IngredientThumbnail product={product} className="hidden sm:block" />}
                  {product && <IngredientShopLink product={product} />}
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            {tCommon("actions.cancel")}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!check}>
            {selected.size ? t("check.submit", { count: selected.size }) : t("check.submitNoItems")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
