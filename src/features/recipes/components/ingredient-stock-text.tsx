import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { productPath, type IngredientCheck } from "../types/recipes";
import { useAmountText } from "./use-amount-text";

type IngredientStockTextProps = {
  check: IngredientCheck;
  /**
   * `stock`: the recipe page ("1 pak (200 g) in voorraad · 1 pak kopen"); `need`: the check dialog ("Nodig 300 g ·
   * in huis 200 g → 1 pak kopen").
   */
  variant: "stock" | "need";
};

/**
 * What an ingredient's stock means for the recipe, in words. Stock is always in its own unit with the package
 * content; a shortage only when the units convert. When they don't (no content per package, or "2 el"), it says
 * so with a link to the product to set its content per package, never a number in the wrong unit.
 */
export function IngredientStockText({ check, variant }: IngredientStockTextProps) {
  const { t } = useTranslation("recipes");
  const text = useAmountText();
  const product = check.product;
  const need = text.amount(check.needed, check.unit);
  const buy = product && check.shortfallPackages ? t("stock.buy", { amount: text.stockUnits(check.shortfallPackages, product) }) : null;
  const setContent = product && check.status === "unknown_amount" && (
    <Link to={productPath(product.id)} className="text-primary underline-offset-4 hover:underline">
      {t("stock.setContent")}
    </Link>
  );

  if (variant === "stock") {
    if (!product) return null;
    if (check.stock === null) return <span>{t("stock.notKept")}</span>;
    const have = t("stock.inStock", { amount: text.stock(check.stock, product) });
    return (
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span>{have}</span>
        {check.status === "short" && buy && <span>· {buy}</span>}
        {setContent && <span>· {setContent}</span>}
      </span>
    );
  }

  if (!product) return <span>{t("stock.needNoProduct", { need })}</span>;
  if (check.status === "unknown_amount") {
    return (
      <span className="flex flex-wrap items-baseline gap-x-1">
        <span>{check.stock === null ? t("stock.needNotKept", { need }) : t("stock.needStock", { need, stock: text.stock(check.stock, product) })}</span>
        <span>· {setContent}</span>
      </span>
    );
  }
  if (check.stock === null) return <span>{[t("stock.needNotKept", { need }), buy].filter(Boolean).join(" → ")}</span>;
  const have = text.amount(check.stockInRecipeUnit ?? 0, check.unit);
  return <span>{[t("stock.needHave", { need, have }), check.status === "short" ? buy : null].filter(Boolean).join(" → ")}</span>;
}
