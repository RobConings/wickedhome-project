import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { shoppingStockNeed, type ShoppingStockStatus } from "../types/shopping";

type StockItem = {
  stockStatus?: ShoppingStockStatus | null;
  isEssential?: boolean | null;
};

/** Same dividers inside each category, in the list, shop view and visit selection. */
export function ShoppingNeedSections<T extends StockItem>({
  items,
  children,
}: {
  items: T[];
  children: (items: T[]) => ReactNode;
}) {
  const { t } = useTranslation("shopping");
  const id = useId();
  const groups = (["out", "nearly_out", "other"] as const)
    .map((key) => ({
      key,
      items: items.filter(
        (item) =>
          (shoppingStockNeed(item.stockStatus, item.isEssential) ?? "other") ===
          key,
      ),
    }))
    .filter((group) => group.items.length);
  if (groups.length === 1 && groups[0]!.key === "other") return children(items);
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <section
          key={group.key}
          data-stock-need={group.key}
          aria-labelledby={`${id}-${group.key}`}
        >
          <h4
            id={`${id}-${group.key}`}
            className={cn(
              "flex items-center justify-between gap-2 border-t px-2 py-2 text-xs font-semibold",
              group.key === "out"
                ? "text-danger"
                : group.key === "nearly_out"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
            title={t(`stockNeedHelp.${group.key}`)}
          >
            <span>{t(`stockNeed.${group.key}`)}</span>
            <span className="tabular-nums">{group.items.length}</span>
          </h4>
          {children(group.items)}
        </section>
      ))}
    </div>
  );
}
