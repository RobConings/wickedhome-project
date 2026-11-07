import { useTranslation } from "react-i18next";
import { ProductEssentialBadge } from "./product-essential-badge";
import { ShoppingStockBadge } from "./shopping-stock-badge";

/** Both stock levels stay on the list; importance and urgency help the person choose what to buy. */
export function ShoppingGuidance() {
  const { t } = useTranslation("shopping");
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("guidance.label")}</summary>
      <p className="max-w-prose py-2">{t("guidance.choice")}</p>
      <div className="flex flex-wrap gap-2 pb-2">
        <ShoppingStockBadge status="below_minimum" />
        <ShoppingStockBadge status="at_minimum" />
        <ProductEssentialBadge isEssential />
        <ProductEssentialBadge isEssential={false} />
      </div>
    </details>
  );
}
