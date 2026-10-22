import { ChefHatIcon, GlobeIcon, HouseIcon, LibraryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Shop } from "../types/shops";

/** "Built-in" or "Own", plus "Webshop" when the shop sells online and "Ingredients" when it is searched for recipe ingredients. */
export function ShopMarkers({ shop }: { shop: Pick<Shop, "isBuiltIn" | "hasWebshop"> & Partial<Pick<Shop, "ingredientSearch">> }) {
  const { t } = useTranslation("shops");
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shop.isBuiltIn ? (
        <Badge variant="outline" className="font-normal text-muted-foreground" title={t("markers.builtInDescription")}>
          <LibraryIcon aria-hidden="true" />
          {t("markers.builtIn")}
        </Badge>
      ) : (
        <Badge variant="secondary" className="font-normal" title={t("markers.ownDescription")}>
          <HouseIcon aria-hidden="true" />
          {t("markers.own")}
        </Badge>
      )}
      {shop.hasWebshop && (
        <Badge variant="outline" className="font-normal">
          <GlobeIcon aria-hidden="true" />
          {t("markers.webshop")}
        </Badge>
      )}
      {shop.ingredientSearch && (
        <Badge variant="outline" className="font-normal" title={t("markers.ingredientSearchDescription")}>
          <ChefHatIcon aria-hidden="true" />
          {t("markers.ingredientSearch")}
        </Badge>
      )}
    </span>
  );
}
