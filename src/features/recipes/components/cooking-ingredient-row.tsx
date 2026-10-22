import * as React from "react";
import { CheckIcon, MinusIcon, MoreHorizontalIcon, PlusIcon, Undo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RecipeActionResult } from "../data/recipes-loaders";
import { productPath, type CookingIngredient } from "../types/recipes";
import { IngredientProductLink, IngredientShopLink, IngredientThumbnail } from "./ingredient-product";
import { useAmountText } from "./use-amount-text";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";

type CookingIngredientRowProps = {
  item: CookingIngredient;
  entryId: string;
  /** The current step mentions it: shown first and marked. */
  mentioned?: boolean;
  /** The meal was made: taps are off. */
  disabled?: boolean;
  /** Undo a tap (the screen's undo fetcher). */
  onUndo: (usageId: string) => void;
  /** Route to post to (default: the current route). */
  action?: string;
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One ingredient while cooking: "used 1,5 pak (300 g) of 300 g", stock left in its own unit and a big "Used"
 * button that takes the planned amount (converted to the stock unit: 300 g = 1.5 packs of 200 g) out of stock at
 * once (optimistic). When the recipe's unit doesn't convert ("2 el", or no content per package), "Used" asks how
 * much, in the stock unit, instead of taking a wrong amount. "…" opens − / + and a custom amount. Each tap toasts
 * with "Undo"; the last tap can also be undone from the row. A linked product shows its photo, a link to its
 * page and its webshop.
 */
export function CookingIngredientRow({ item, entryId, mentioned, disabled, onUndo, action }: CookingIngredientRowProps) {
  const { t } = useTranslation("recipes");
  const text = useAmountText();
  const fetcher = useFetcher<RecipeActionResult>({
    key: `cook-use-${item.kind}-${item.id}`,
  });
  const product = item.product;
  const [amountOpen, setAmountOpen] = React.useState(false);
  const [custom, setCustom] = React.useState(String(item.tapAmount ?? 1));
  const pending = fetcher.formData ? Number(fetcher.formData.get("quantity")) || 0 : 0;
  const used = round3(item.used + pending);
  // Recipe units per stock unit (200 g per pack), to show taps in the recipe's unit too.
  const ratio = item.needed && item.neededInStockUnits ? item.needed / item.neededInStockUnits : item.used && item.usedInRecipeUnit ? item.usedInRecipeUnit / item.used : null;
  const showRecipeUnit = Boolean(product && item.unit && ratio && item.unit !== product.unit);
  const stockAmount = (value: number) => (product ? text.stockUnits(value, product) : text.amount(value, item.unit));
  const usedText = `${stockAmount(used)}${showRecipeUnit && ratio ? ` (${text.amount(used * ratio, item.unit)})` : ""}`;
  const done = item.needed !== null && (item.neededInStockUnits !== null ? used >= item.neededInStockUnits - 1e-9 : !product && used >= item.needed);
  useFetcherResult(fetcher, (result) => {
    if (result.formError) {
      toast.error(result.formError);
      return;
    }
    if (!result.ok || !result.usageId) return;
    const usageId = result.usageId;
    // One toast per tap, also when the row is on the page twice (side column and sheet).
    toast.success(t("cooking.usedToast", { name: item.name }), {
      id: `cook-use-${usageId}`,
      description: result.addedToShoppingList ? t("cooking.addedToList") : undefined,
      action: { label: t("cooking.undo"), onClick: () => onUndo(usageId) },
  });
  });

  const use = (quantity: number) => {
    if (!(quantity > 0)) return;
    setAmountOpen(false);
    void fetcher.submit(
      {
        intent: "use",
        entryId,
        [item.kind === "extra" ? "extraId" : "ingredientId"]: item.id,
        quantity: String(round3(quantity)),
      },
      { method: "post", action },
    );
  };
  const customValue = Number(custom.replace(",", "."));
  const unitLabel = product ? product.unit : item.unit;

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg p-2", mentioned && "bg-primary/5 ring-1 ring-primary/30")}>
      <div className="flex items-start gap-3">
        {product && <IngredientThumbnail product={product} />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("font-medium break-words", done && "text-muted-foreground")}>{item.name}</span>
            {item.optional && <span className="text-xs text-muted-foreground">{t("ingredients.optionalShort")}</span>}
          </span>
          {item.note && <span className="text-sm break-words text-muted-foreground">{item.note}</span>}
          {product && product.name !== item.name && <IngredientProductLink product={product} className="text-xs" />}
          <span className="text-xs text-muted-foreground tabular-nums">
            {item.needed !== null
              ? t("cooking.usedOf", { used: usedText, needed: text.amount(item.needed, item.unit) })
              : t("cooking.usedOnly", { used: usedText })}
            {" · "}
            {item.stock !== null && product
              ? t("cooking.stockLeft", { amount: text.stock(round3(Math.max(0, item.stock - pending)), product) })
              : t("cooking.noStock")}
          </span>
          {!item.comparable && product && (
            <span className="text-xs text-muted-foreground">
              {t("cooking.noConversion", { unit: product.unit ?? t("units.pieces") })}{" "}
              <Link to={productPath(product.id)} className="text-primary underline-offset-4 hover:underline">
                {t("stock.setContent")}
              </Link>
            </span>
          )}
        </div>
        {product && <IngredientShopLink product={product} />}
      </div>
      <div className="flex items-center justify-end gap-2">
        {item.lastUsageId && !pending && !disabled && (
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => onUndo(item.lastUsageId!)}
            aria-label={t("cooking.undoFor", { name: item.name })}
            title={t("cooking.undoFor", { name: item.name })}
          >
            <Undo2Icon />
          </Button>
        )}
        <Popover open={amountOpen} onOpenChange={setAmountOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-lg"
              disabled={disabled}
              aria-label={t("cooking.otherAmount", { name: item.name })}
              title={t("cooking.otherAmount", { name: item.name })}
            >
              <MoreHorizontalIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-64 flex-col gap-3">
            <span className="text-sm font-medium">{t("cooking.howMuch", { name: item.name })}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-lg" onClick={() => setCustom(String(Math.max(0, round3((customValue || 0) - 1))))} aria-label={t("cooking.less")}>
                <MinusIcon />
              </Button>
              <Input
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                inputMode="decimal"
                aria-label={t("cooking.amount")}
                className="h-10 text-center text-base"
                onKeyDown={(event) => event.key === "Enter" && use(customValue)}
              />
              <Button variant="outline" size="icon-lg" onClick={() => setCustom(String(round3((customValue || 0) + 1)))} aria-label={t("cooking.moreAmount")}>
                <PlusIcon />
              </Button>
            </div>
            {unitLabel && <span className="text-xs text-muted-foreground">{t("cooking.inUnit", { unit: unitLabel })}</span>}
            {showRecipeUnit && ratio && customValue > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">= {text.amount(customValue * ratio, item.unit)}</span>
            )}
            <Button onClick={() => use(customValue)} disabled={!(customValue > 0)}>
              <CheckIcon />
              {t("cooking.useAmount", { amount: Number.isFinite(customValue) && customValue > 0 ? stockAmount(customValue) : "…" })}
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          size="lg"
          className="h-12 min-w-24"
          variant={done ? "secondary" : "default"}
          // In a unit that doesn't convert, the tap asks how much (in the stock unit) instead of guessing.
          onClick={() => (item.tapAmount === null ? setAmountOpen(true) : use(item.tapAmount))}
          disabled={disabled}
          aria-label={
            item.tapAmount === null
              ? t("cooking.otherAmount", { name: item.name })
              : t("cooking.useLabel", { name: item.name, amount: stockAmount(item.tapAmount) })
          }
        >
          <CheckIcon />
          {t("cooking.used")}
        </Button>
      </div>
    </div>
  );
}
