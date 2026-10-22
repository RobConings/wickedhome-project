import { CheckIcon, ShoppingCartIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ShoppingStockStatus } from "../types/shopping";

export function ShoppingStockBadge({ status, showAdvice = true }: { status: ShoppingStockStatus; showAdvice?: boolean }) {
  const { t } = useTranslation("shopping");
  const Icon = status === "below_minimum" ? ShoppingCartIcon : status === "at_minimum" ? TriangleAlertIcon : CheckIcon;
  return (
    <Badge
      variant={status === "below_minimum" ? "danger" : status === "at_minimum" ? "warning" : "neutral"}
      className="gap-1"
      title={t(`stockHelp.${status}`)}
    >
      <Icon aria-hidden="true" />
      {t(`${showAdvice && status !== "above_minimum" ? "stockAdvice" : "stockStatus"}.${status}`)}
    </Badge>
  );
}
