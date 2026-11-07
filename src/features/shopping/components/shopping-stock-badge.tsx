import { CheckIcon, ShoppingCartIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { shoppingStockNeed, type ShoppingStockStatus } from "../types/shopping";

export function ShoppingStockBadge({
  status,
  isEssential = null,
  showAdvice = true,
}: {
  status: ShoppingStockStatus;
  isEssential?: boolean | null;
  showAdvice?: boolean;
}) {
  const { t } = useTranslation("shopping");
  const need = showAdvice ? shoppingStockNeed(status, isEssential) : null;
  const Icon =
    need === "out"
      ? ShoppingCartIcon
      : need === "nearly_out"
        ? TriangleAlertIcon
        : CheckIcon;
  return (
    <Badge
      variant={
        need === "out"
          ? "danger"
          : need === "nearly_out"
            ? "warning"
            : "neutral"
      }
      className="gap-1"
      title={t(need ? `stockNeedHelp.${need}` : `stockHelp.${status}`)}
    >
      <Icon aria-hidden="true" />
      {t(need ? `stockNeed.${need}` : `stockStatus.${status}`)}
    </Badge>
  );
}
