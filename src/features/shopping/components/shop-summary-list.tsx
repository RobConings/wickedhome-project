import { ChevronRightIcon, CircleHelpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ShopLogo, type Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NO_SHOP, estimateTotal, type ShoppingItem } from "../types/shopping";
import { groupItemsByShop, isShopKey } from "./shopping-grouping";

type ShopSummaryListProps = {
  items: ShoppingItem[];
  shops: Shop[];
  /** Highlights the shop that is open in the shop view. */
  activeKey?: string;
  className?: string;
};

/** "Colruyt 8 · Gamma 2 · No shop chosen 1": where to go (with an estimate of the cost), linking to each shop view. */
export function ShopSummaryList({ items, shops, activeKey, className }: ShopSummaryListProps) {
  const { t } = useTranslation("shopping");
  const open = items.filter((item) => item.status === "open");
  const groups = groupItemsByShop(open, shops);
  const locale = currentLocale();
  if (groups.length === 0) return null;

  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {groups.map((group) => {
        const name = group.key === NO_SHOP ? t("shops.noShop") : (group.shop?.name ?? group.name ?? "");
        return (
          <li key={group.key}>
            <Link
              to={`/shopping/shops/${group.key}`}
              aria-label={t("shops.openShop", { name })}
              aria-current={activeKey === group.key ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
                activeKey === group.key && "bg-accent font-medium text-accent-foreground",
              )}
            >
              {group.shop ? (
                // The shop's logo, or its type icon when it has none.
                <ShopLogo shop={group.shop} size="md" className="size-8" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <CircleHelpIcon className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{name}</span>
                {(() => {
                  const estimate = estimateTotal(open.filter((item) => isShopKey(group.key, item)));
                  return estimate.priced > 0 ? (
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">
                      {t("shops.estimate", { total: formatCurrency(estimate.cents, locale) })}
                    </span>
                  ) : null;
                })()}
              </span>
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">{group.open}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
