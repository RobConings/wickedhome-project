import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Shop } from "@/features/shops";
import { cn } from "@/lib/utils";
import type { ShoppingItem } from "../types/shopping";
import { ShoppingItemRow } from "./shopping-item-row";

type ShoppingItemListProps = {
  items: ShoppingItem[];
  shops: Shop[];
  onToggle: (item: ShoppingItem) => void;
  onDelete?: (item: ShoppingItem) => void;
  /** Whether a given item may be deleted (e.g. children only their own). Defaults to all when `onDelete` is set. */
  canDelete?: (item: ShoppingItem) => boolean;
  /** Opens the item's edit dialog (an edit button per row). */
  onEdit?: (item: ShoppingItem) => void;
  showShop?: boolean;
  showList?: boolean;
  size?: "default" | "large";
  /** Text when there is nothing open. */
  emptyText?: string;
  className?: string;
};

/** Open items first; items bought in the last day folded away below, so a mistaken tick can be undone. */
export function ShoppingItemList({
  items,
  shops,
  onToggle,
  onDelete,
  canDelete,
  onEdit,
  showShop = true,
  showList = false,
  size = "default",
  emptyText,
  className,
}: ShoppingItemListProps) {
  const { t } = useTranslation("shopping");
  const [showBought, setShowBought] = React.useState(false);
  const shopsById = React.useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops]);
  const open = items.filter((item) => item.status === "open");
  const bought = items.filter((item) => item.status === "bought");

  const renderRow = (item: ShoppingItem) => (
    <ShoppingItemRow
      key={item.id}
      item={item}
      shop={item.shopId ? shopsById.get(item.shopId) : null}
      showShop={showShop}
      showList={showList}
      size={size}
      onToggle={onToggle}
      onDelete={onDelete && (canDelete?.(item) ?? true) ? onDelete : undefined}
      onEdit={onEdit && (canDelete?.(item) ?? true) ? onEdit : undefined}
    />
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {open.length > 0 ? (
        <ul className={cn("divide-y rounded-xl border bg-card shadow-xs", size === "large" ? "px-4" : "px-3")}>{open.map(renderRow)}</ul>
      ) : (
        emptyText && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      )}
      {bought.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={showBought}
            onClick={() => setShowBought((value) => !value)}
            className="flex min-h-9 items-center gap-1.5 self-start rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronDownIcon className={cn("size-4 transition-transform", !showBought && "-rotate-90")} aria-hidden="true" />
            {t("lists.recentlyBought")} ({bought.length})
          </button>
          {showBought && <ul className={cn("divide-y rounded-xl border bg-muted/30", size === "large" ? "px-4" : "px-3")}>{bought.map(renderRow)}</ul>}
        </div>
      )}
    </div>
  );
}
