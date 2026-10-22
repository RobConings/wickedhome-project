import { useTranslation } from "react-i18next";
import { formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { IngredientProduct } from "../types/recipes";

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * How recipes write amounts, in the person's language: a recipe amount ("300 g"), stock in its own unit with the
 * package content ("1 pak (200 g)"), and what to buy ("1 pak"). Stock is never shown in the recipe's unit alone.
 */
export function useAmountText() {
  const { t } = useTranslation("recipes");
  const locale = currentLocale();
  const amount = (value: number, unit: string | null | undefined) => `${formatQuantity(round3(value), locale)}${unit ? ` ${unit}` : ""}`;
  /** Stock units ("1 pak"; a product without a unit: "1 ×"). */
  const stockUnits = (value: number, product: Pick<IngredientProduct, "unit">) =>
    product.unit ? amount(value, product.unit) : t("units.times", { amount: formatQuantity(round3(value), locale) });
  /** Stock with what it holds: "1 pak (200 g)", "1,5 pak (300 g)"; without a package size just "1 pak". */
  const stock = (value: number, product: Pick<IngredientProduct, "unit" | "packageAmount" | "packageUnit">) => {
    const content = product.packageAmount && product.packageUnit ? ` (${amount(value * product.packageAmount, product.packageUnit)})` : "";
    return `${stockUnits(value, product)}${content}`;
  };
  return { amount, stockUnits, stock };
}
