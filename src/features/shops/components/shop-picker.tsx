import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";
import type { UseSelectionsOptions } from "@/lib/selections";
import { useShopSelections } from "../data/use-shop-selections";
import type { Shop } from "../types/shops";
import { ShopLogo } from "./shop-logo";

type ShopPickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  /** Shops to choose from, e.g. from `fetchShops()`. */
  shops: Shop[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose a shop, with the user's favourite and recently used shops on top. Works in a `<Form>` via `name`.
 * After the form saves, call `recordUse(shopId)` from `useShopSelections()`.
 */
export function ShopPicker({ shops, initialSelections, placeholder, loading, ...props }: ShopPickerProps) {
  const { t } = useTranslation("shops");
  const selections = useShopSelections({ initial: initialSelections });
  const { favoriteIds, recentIds, toggleFavorite } = selections;

  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      shops.map((shop) => ({
        id: shop.id,
        label: shop.name,
        description: t(`types.${shop.type}`),
        leading: <ShopLogo shop={shop} size="sm" className="text-muted-foreground" />,
        keywords: shop.websiteUrl ? [shop.websiteUrl] : undefined,
      })),
    [shops, t],
  );

  return (
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      // Favourites and recents arrive separately from the shops: show placeholders until both are known.
      loading={loading || selections.loading}
      onToggleFavorite={(id) => toggleFavorite(id).catch(() => toast.error(t("favorite.failed")))}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
