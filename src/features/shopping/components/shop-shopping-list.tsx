import * as React from "react";
import { StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useLiveShoppingItems } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import type { ShoppingItem } from "../types/shopping";
import { ShoppingItemRow } from "./shopping-item-row";
import { ShoppingItemsError, ShoppingItemsSkeleton } from "./shopping-items-status";

type ShopShoppingListProps = {
  shopId: string;
  /** Show at most this many items, with "and n more". */
  limit?: number;
  /** Seed items instead of fetching (stories). */
  initialItems?: ShoppingItem[];
};

/**
 * What is on the list for one shop, from every list, with a link to the shop view. Loads its own data, so
 * other pages can show it: the shop's page ("On the list here") and store visits in the calendar
 * (`renderShopList={(shopId) => <ShopShoppingList shopId={shopId} />}`).
 */
export function ShopShoppingList({ shopId, limit, initialItems }: ShopShoppingListProps) {
  const { t } = useTranslation("shopping");
  const { items, failed, refresh } = useLiveShoppingItems({ shopId, status: "open" }, { initial: initialItems });
  const onChanged = React.useCallback(() => {
    if (!initialItems) void refresh();
  }, [initialItems, refresh]);
  const actions = useShoppingItemActions({ items: items ?? NO_ITEMS, onChanged });

  if (items === null) return failed ? <ShoppingItemsError onRetry={refresh} /> : <ShoppingItemsSkeleton rows={limit ? Math.min(limit, 3) : 3} />;

  const visible = limit ? actions.items.slice(0, limit) : actions.items;
  const hidden = actions.items.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("storeVisit.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-3">
          {visible.map((item) => (
            <ShoppingItemRow key={item.id} item={item} showShop={false} showList onToggle={(target) => void actions.toggle(target)} />
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        {hidden > 0 ? <span className="text-sm text-muted-foreground">{t("storeVisit.more", { count: hidden })}</span> : <span />}
        <Button asChild variant="outline" size="sm">
          <Link to={`/shopping/shops/${encodeURIComponent(shopId)}`}>
            <StoreIcon />
            {t("storeVisit.openShopView")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

const NO_ITEMS: ShoppingItem[] = [];
