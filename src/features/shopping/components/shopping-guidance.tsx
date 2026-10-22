import { useTranslation } from "react-i18next";
import { ProductEssentialBadge } from "./product-essential-badge";
import { ShoppingStockBadge } from "./shopping-stock-badge";

/** Both stock levels stay on the list; importance and urgency help the person choose what to buy. */
export function ShoppingGuidance() {
  const { t } = useTranslation("shopping");
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
      <p className="text-sm text-muted-foreground">{t("guidance.choice")}</p>
      <div className="flex flex-wrap gap-2">
        <ShoppingStockBadge status="below_minimum" />
        <ShoppingStockBadge status="at_minimum" />
        <ProductEssentialBadge isEssential />
        <ProductEssentialBadge isEssential={false} />
      </div>
    </div>
  );
}
