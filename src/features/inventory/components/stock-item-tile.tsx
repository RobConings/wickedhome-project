import type * as React from "react";
import { CalendarClockIcon, MapPinIcon, MinusIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/shared/card";
import { formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate } from "@/types/date-format";
import type { StockItem } from "../types/inventory";

type StockItemTileProps = {
  item: StockItem;
  /** Show the place (lists not grouped by place). */
  showPlace?: boolean;
  /** Use one / add one buttons. */
  onAdjust?: (item: StockItem, delta: number) => void;
  /** A change is being saved (pass the item with the change applied, see `StockItemRow`). */
  pending?: boolean;
  /** Extra controls next to −1 / +1, e.g. an edit button. */
  actions?: React.ReactNode;
};

/** A stock item as a tile (two per row on a phone): product, amount, minimum, expiry and quick −1 / +1. */
export function StockItemTile({ item, showPlace = true, onAdjust, pending, actions }: StockItemTileProps) {
  const { t } = useTranslation("inventory");
  const locale = currentLocale();

  return (
    <Card className={cn("gap-3 p-4", item.isLow && "border-warning/40")}>
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={`/inventory/products/${encodeURIComponent(item.productId)}`}
          className="line-clamp-2 font-medium break-words underline-offset-4 hover:underline focus-visible:underline"
        >
          {item.productName}
        </Link>
        {showPlace && (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.placeName}</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-busy={pending || undefined}>
        <span className={cn("flex items-center gap-1.5 text-2xl font-semibold tabular-nums", item.isLow && "text-warning")}>
          {pending && <Spinner className="size-3.5 text-muted-foreground" label={t("stock.saving")} />}
          {formatQuantity(item.quantity, locale)}
          {item.unit && <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>}
        </span>
        {item.isLow && (
          <Badge variant="outline" className="gap-1 border-warning/40 font-normal text-warning">
            <TriangleAlertIcon aria-hidden="true" />
            {t("stock.low")}
          </Badge>
        )}
      </div>

      {(item.minQuantity !== null || item.expiresOn) && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {item.minQuantity !== null && <span>{t("stock.minimum", { quantity: formatQuantity(item.minQuantity, locale) })}</span>}
          {item.expiresOn && (
            <span className="inline-flex items-center gap-1">
              <CalendarClockIcon className="size-3" aria-hidden="true" />
              {t("stock.expires", { date: formatDate(item.expiresOn, locale) })}
            </span>
          )}
        </div>
      )}

      {(onAdjust || actions) && (
        <div className="mt-auto flex flex-wrap items-center gap-1">
          {onAdjust && (
            <>
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
            </>
          )}
          <span className="flex-1" />
          {actions}
        </div>
      )}
    </Card>
  );
}
