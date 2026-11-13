import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { ShoppingNeedSections } from "./shopping-need-sections";
import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Shop } from "@/features/shops";
import { cn } from "@/lib/utils";
import type { ShoppingItem } from "../types/shopping";
import { groupItemsByCategory } from "./shopping-grouping";
import { useCategoryOrder } from "../data/use-category-order";
import { ShoppingItemRow } from "./shopping-item-row";

type ShoppingItemListProps = {
  items: ShoppingItem[];
  shops: Shop[];
  onToggle: (item: ShoppingItem) => void;
  onDelete?: (item: ShoppingItem) => void;
  onSkip?: (item: ShoppingItem) => void;
  /** Whether a given item may be deleted (e.g. children only their own). Defaults to all when `onDelete` is set. */
  canDelete?: (item: ShoppingItem) => boolean;
  /** Opens the item's edit dialog (an edit button per row). */
  onEdit?: (item: ShoppingItem) => void;
  showShop?: boolean;
  showList?: boolean;
  showStockStatus?: boolean;
  groupByCategory?: boolean;
  groupByNeed?: boolean;
  size?: "default" | "large";
  /** Text when there is nothing open. */
  emptyText?: string;
  collectAndGoMatches?: ReadonlySet<string>;
  className?: string;
};

/** Open items first; items bought in the last day folded away below, so a mistaken tick can be undone. */
export function ShoppingItemList({
  items,
  shops,
  onToggle,
  onDelete,
  onSkip,
  canDelete,
  onEdit,
  showShop = true,
  showList = false,
  showStockStatus = true,
  groupByCategory = true,
  groupByNeed = true,
  size = "default",
  emptyText,
  collectAndGoMatches,
  className,
}: ShoppingItemListProps) {
  const { t } = useTranslation("shopping");
  const { order } = useCategoryOrder();
  const skipped = items.filter((item) => item.status === "skipped");
  const [showBought, setShowBought] = React.useState(false);
  const shopsById = React.useMemo(
    () => new Map(shops.map((shop) => [shop.id, shop])),
    [shops],
  );
  const open = items.filter((item) => item.status === "open");
  const bought = items.filter((item) => item.status === "bought");

  const renderRow = (item: ShoppingItem) => (
    <ShoppingItemRow
      key={item.id}
      item={item}
      inCollectAndGo={collectAndGoMatches?.has(item.id)}
      shop={item.shopId ? shopsById.get(item.shopId) : null}
      showShop={showShop}
      showList={showList}
      showStockStatus={showStockStatus}
      size={size}
      onToggle={onToggle}
      onSkip={onSkip}
      onDelete={onDelete && (canDelete?.(item) ?? true) ? onDelete : undefined}
      onEdit={onEdit && (canDelete?.(item) ?? true) ? onEdit : undefined}
    />
  );

  const renderOpen = (items: ShoppingItem[]) =>
    !groupByNeed ? (
      <ul className="divide-y rounded-xl border bg-card px-1 shadow-xs sm:px-2">
        {items.map(renderRow)}
      </ul>
    ) : (
      <ShoppingNeedSections items={items}>
        {(group) => (
          <ul className="divide-y rounded-xl border bg-card px-1 shadow-xs sm:px-2">
            {group.map(renderRow)}
          </ul>
        )}
      </ShoppingNeedSections>
    );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {open.length > 0 && !groupByCategory ? (
        renderOpen(open)
      ) : open.length > 0 ? (
        <Stack gap="3">
          {groupItemsByCategory(open, order).map((group) => (
            <section key={group.category}>
              <h3 className="mb-1 text-sm font-medium">
                {t(`categories.${group.category}`)}
              </h3>
              {renderOpen(group.items)}
            </section>
          ))}
        </Stack>
      ) : (
        emptyText && (
          <Text size="sm" tone="muted" className="rounded-xl border border-dashed px-4 py-6 text-center">
            {emptyText}
          </Text>
        )
      )}
      {skipped.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("planning.skipped")} ({skipped.length})
          </summary>
          <ul className="divide-y rounded-xl border px-2">
            {skipped.map(renderRow)}
          </ul>
        </details>
      )}
      {bought.length > 0 && (
        <Stack gap="xs">
          <button
            type="button"
            aria-expanded={showBought}
            onClick={() => setShowBought((value) => !value)}
            className="flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronDownIcon
              className={cn(
                "size-4 transition-transform",
                !showBought && "-rotate-90",
              )}
              aria-hidden="true"
            />
            {t("lists.recentlyBought")} ({bought.length})
          </button>
          {showBought && (
            <ul className="divide-y rounded-xl border bg-muted/30 px-1 sm:px-2">
              {bought.map(renderRow)}
            </ul>
          )}
        </Stack>
      )}
    </div>
  );
}
