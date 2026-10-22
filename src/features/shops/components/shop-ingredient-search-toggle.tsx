import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ShopActionResult } from "../data/shops-loaders";
import { canSearchIngredients, type Shop } from "../types/shops";

type ShopIngredientSearchToggleProps = {
  shop: Pick<Shop, "id" | "name" | "hasWebshop" | "websiteUrl" | "ingredientSearch">;
  /** Adults and owners switch it; others see the state only. */
  canChange: boolean;
};

/**
 * "Use for ingredient search": the assistant may look on this shop's webshop for recipe ingredients the
 * household doesn't have as a product yet. Applies at once (optimistic, rolled back with a toast on failure);
 * only a shop with a webshop and a website can be switched on.
 */
export function ShopIngredientSearchToggle({ shop, canChange }: ShopIngredientSearchToggleProps) {
  const { t } = useTranslation("shops");
  const fetcher = useFetcher<ShopActionResult>();
  const saving = fetcher.state !== "idle";
  const pending = fetcher.formData?.get("enabled");
  const checked = pending !== undefined && pending !== null ? pending === "true" : shop.ingredientSearch;
  const eligible = canSearchIngredients(shop);
  const id = `shop-ingredient-search-${shop.id}`;

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok && fetcher.data.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  const hint = !eligible ? t("ingredientSearch.needsWebshop") : saving ? t("ingredientSearch.saving") : t("ingredientSearch.description");

  return (
    <div className="flex items-start gap-3" aria-busy={saving || undefined}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {t("ingredientSearch.label")}
        </Label>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {saving && <Spinner className="size-3" />}
          {hint}
        </span>
      </div>
      <Switch
        id={id}
        checked={checked && eligible}
        disabled={!canChange || !eligible || saving}
        onCheckedChange={(next) => void fetcher.submit({ intent: "ingredient-search", id: shop.id, enabled: String(next) }, { method: "post" })}
      />
    </div>
  );
}
