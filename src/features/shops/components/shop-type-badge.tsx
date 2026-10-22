import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ShopType } from "../types/shops";
import { ShopTypeIcon } from "./shop-type-icon";

export function ShopTypeBadge({ type }: { type: ShopType }) {
  const { t } = useTranslation("shops");
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <ShopTypeIcon type={type} />
      {t(`types.${type}`)}
    </Badge>
  );
}
