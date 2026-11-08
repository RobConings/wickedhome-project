import { useMemo, type ComponentProps } from "react";
import { LayersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";
import { IconChip } from "@/components/shared/icon-chip";
import { useSelections, type UseSelectionsOptions } from "@/lib/selections";
import { useShopSelections } from "../data/use-shop-selections";
import { ShopLogo } from "./shop-logo";
import type { SavedShopGroup, Shop } from "../types/shops";

type Props = Omit<ComponentProps<typeof EntityPicker>, "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"> & {
  shops: Shop[];
  groups: SavedShopGroup[];
  initialSelections?: { shops?: UseSelectionsOptions["initial"]; groups?: UseSelectionsOptions["initial"] };
};

/** One destination: a shop or an existing group. Both reuse personal favourites and recents. */
export function ShopDestinationPicker({ shops, groups, initialSelections, ...props }: Props) {
  const { t } = useTranslation("shops");
  const shopSelections = useShopSelections({ initial: initialSelections?.shops });
  const groupSelections = useSelections("shop_group", { initial: initialSelections?.groups });
  const items = useMemo<EntityPickerItem[]>(() => [
    ...groups.map((group) => ({ id: `group:${group.id}`, label: group.name, featuredGroup: t("groups.title"),
      description: group.shopIds.map((id) => shops.find((shop) => shop.id === id)?.name).filter(Boolean).join(" · "),
      leading: <IconChip icon={LayersIcon} tone="shopping" size="sm" /> })),
    ...shops.map((shop) => ({ id: `shop:${shop.id}`, label: shop.name, description: t(`types.${shop.type}`), leading: <ShopLogo shop={shop} size="sm" /> })),
  ], [shops, groups, t]);
  return <EntityPicker {...props} items={items}
    placeholder={props.placeholder ?? t("destination.placeholder")}
    favoriteIds={[...groupSelections.favoriteIds.map((id) => `group:${id}`), ...shopSelections.favoriteIds.map((id) => `shop:${id}`)]}
    recentIds={[...groupSelections.recentIds.map((id) => `group:${id}`), ...shopSelections.recentIds.map((id) => `shop:${id}`)]}
    loading={shopSelections.loading || groupSelections.loading}
    onToggleFavorite={(value) => (value.startsWith("group:") ? groupSelections.toggleFavorite(value.slice(6)) : shopSelections.toggleFavorite(value.slice(5))).catch(() => toast.error(t("favorite.failed")))}
  />;
}
