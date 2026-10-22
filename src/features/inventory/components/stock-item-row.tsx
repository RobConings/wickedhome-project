import type * as React from "react";
import { CalendarClockIcon, MapPinIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import type { StockItem } from "../types/inventory";

type StockItemRowProps = {
  item: StockItem;
  /** Show the product name (lists by place) and/or the place (lists by product). */
  showProduct?: boolean;
  showPlace?: boolean;
  /** Use one / add one buttons. */
  onAdjust?: (item: StockItem, delta: number) => void;
  /**
   * A change is being saved. Pass the item with that change already applied (`useStockActions().show`):
   * the row shows the new amount with a small spinner, and the buttons stay usable for the next tap.
   */
  pending?: boolean;
  /** Extra controls at the end, e.g. an edit button. */
  actions?: React.ReactNode;
  /** `li` in your own `<ul>` (default); `div` as a `GeneralList` row, which draws the item, dividers and padding. */
  as?: "li" | "div";
  className?: string;
};

/** How much of a product is at a place, with its minimum and expiry, and quick −1 / +1 buttons. */
export function StockItemRow({
  item,
  showProduct = true,
  showPlace = true,
  onAdjust,
  pending,
  actions,
  as: Element = "li",
  className,
}: StockItemRowProps) {
  const { t } = useTranslation("inventory");
  const locale = currentLocale();
  const amount = `${formatQuantity(item.quantity, locale)}${item.unit ? ` ${item.unit}` : ""}`;
  const meta = [
    item.minQuantity !== null && t("stock.minimum", { quantity: formatQuantity(item.minQuantity, locale) }),
  ].filter(Boolean);

  return (
    <Element className={cn("flex items-center gap-3", Element === "li" && "py-2.5", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {showProduct ? (
          <Link
            to={`/inventory/products/${encodeURIComponent(item.productId)}`}
            className="truncate font-medium underline-offset-4 hover:underline focus-visible:underline"
          >
            {item.productName}
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 truncate font-medium">
            <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {item.placeName}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {showProduct && showPlace && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3" aria-hidden="true" />
              {item.placeName}
            </span>
          )}
          {meta.map((text) => (
            <span key={String(text)}>{text}</span>
          ))}
          {item.expiresOn && (
            <span className="inline-flex items-center gap-1">
              <CalendarClockIcon className="size-3" aria-hidden="true" />
              {t("stock.expires", { date: formatDate(item.expiresOn, locale) })}
            </span>
          )}
        </span>
      </div>

      <span className="flex flex-col items-end gap-1" aria-busy={pending || undefined}>
        <span className={cn("flex items-center gap-1.5 text-lg font-semibold tabular-nums", item.isLow && "text-warning")}>
          {pending && <Spinner className="size-3.5 text-muted-foreground" label={t("stock.saving")} />}
          {amount}
        </span>
        {item.isLow && (
          <Badge variant="outline" className="gap-1 border-warning/40 font-normal text-warning">
            <TriangleAlertIcon aria-hidden="true" />
            {t("stock.low")}
          </Badge>
        )}
      </span>

      {onAdjust && (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-coarse:size-11"
            disabled={item.quantity <= 0}
            aria-label={t("stock.useOne", { name: item.productName })}
            title={t("stock.useOne", { name: item.productName })}
            onClick={() => onAdjust(item, -1)}
          >
            <MinusIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-coarse:size-11"
            aria-label={t("stock.addOne", { name: item.productName })}
            title={t("stock.addOne", { name: item.productName })}
            onClick={() => onAdjust(item, 1)}
          >
            <PlusIcon />
          </Button>
        </span>
      )}
      {actions}
    </Element>
  );
}
