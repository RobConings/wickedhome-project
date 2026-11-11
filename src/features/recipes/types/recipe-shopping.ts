import { unitRounding } from "@/types/units";
import type { IngredientCheck } from "./recipes";

/** Empty stock is a known shortage even when its purchase unit still needs a manual quantity. */
export const defaultRecipePurchase = (item: IngredientCheck) =>
  (item.status === "short" || item.status === "not_kept") && !item.onList && !item.optional;

/** Never invent a bag-to-piece or kg-to-head conversion, including a fallback purchase of 1 kg. */
export function recipePurchaseQuantity(item: IngredientCheck): number | null {
  if (!item.product) return item.needed;
  const quantity = item.shortfallPackages && item.shortfallPackages > 0 ? item.shortfallPackages : item.neededInStockUnits;
  if (quantity === null || quantity <= 0) return null;
  const step = unitRounding(item.product.unit, item.product.units);
  return Math.round(Math.ceil(quantity / step - 1e-9) * step * 1000) / 1000;
}

export function parseRecipePurchaseQuantity(value: string): number | null {
  const quantity = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(quantity) && quantity >= 0.001 && quantity <= 100_000 ? Math.round(quantity * 1000) / 1000 : null;
}
