import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { useTranslation } from "react-i18next";
import { ShoppingStockBadge } from "./shopping-stock-badge";

/** Both stock levels stay on the list; importance and urgency help the person choose what to buy. */
export function ShoppingGuidance() {
  const { t } = useTranslation("shopping");
  return (
    <details className="min-w-0 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("guidance.label")}</summary>
      <Text className="max-w-prose py-2">{t("guidance.choice")}</Text>
      <Inline gap="sm" align="stretch" wrap className="pb-2">
        <ShoppingStockBadge status="below_minimum" />
        <ShoppingStockBadge status="at_minimum" />
      </Inline>
    </details>
  );
}
