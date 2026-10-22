import * as React from "react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import type { Shop } from "../types/shops";
import { ShopLogo } from "./shop-logo";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type ShopPickerProps = SelectionsPickerBaseProps & {
  /** Shops to choose from, e.g. from `fetchShops()`. */
  shops: Shop[];
};

/**
 * Choose a shop, with the user's favourite and recently used shops on top. Works in a `<Form>` via `name`.
 * After the form saves, call `recordUse(shopId)` from `useShopSelections()`.
 */
export function ShopPicker({ shops, placeholder, ...props }: ShopPickerProps) {
  const { t } = useTranslation("shops");

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
    <SelectionsPicker
      {...props}
      entityType="shop"
      items={items}
      waitForSelections
      favoriteFailedMessage={t("favorite.failed")}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
