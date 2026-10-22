import { StarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function ProductEssentialBadge({ isEssential }: { isEssential: boolean }) {
  const { t } = useTranslation("shopping");
  return (
    <Badge variant={isEssential ? "default" : "neutral"} className="gap-1">
      {isEssential && <StarIcon aria-hidden="true" className="fill-current" />}
      {t(isEssential ? "products.essential" : "products.nonEssential")}
    </Badge>
  );
}
