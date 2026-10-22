import * as React from "react";
import { ShoppingCartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLiveShoppingItems } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import type { ShoppingItem } from "../types/shopping";
import { ShoppingItemRow } from "./shopping-item-row";
import { ShoppingItemsError, ShoppingItemsSkeleton } from "./shopping-items-status";
import { GhostLinkButton } from "@/components/shared/link-buttons";

type PlaceShoppingSectionProps = {
  placeId: string;
  /** Seed items instead of fetching (stories). */
  initialItems?: ShoppingItem[];
};

/**
 * Open shopping items for a room or zone (materials for its tasks, stock running low there). Loads its own
 * data; renders content only, so the place page wraps it in its own card or section.
 */
export function PlaceShoppingSection({ placeId, initialItems }: PlaceShoppingSectionProps) {
  const { t } = useTranslation("shopping");
  const { items, failed, refresh } = useLiveShoppingItems({ placeId, status: "open" }, { initial: initialItems });
  const onChanged = React.useCallback(() => {
    if (!initialItems) void refresh();
  }, [initialItems, refresh]);
  const actions = useShoppingItemActions({ items: items ?? NO_ITEMS, onChanged });

  if (items === null) return failed ? <ShoppingItemsError onRetry={refresh} /> : <ShoppingItemsSkeleton />;

  return (
    <div className="flex flex-col gap-2">
      {actions.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("place.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-3">
          {actions.items.map((item) => (
            <ShoppingItemRow key={item.id} item={item} onToggle={(target) => void actions.toggle(target)} />
          ))}
        </ul>
      )}
      <GhostLinkButton to="/shopping" icon={ShoppingCartIcon} className="self-start text-muted-foreground">{t("actions.backToShopping")}</GhostLinkButton>
    </div>
  );
}

const NO_ITEMS: ShoppingItem[] = [];
