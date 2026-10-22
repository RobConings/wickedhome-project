import * as React from "react";
import { BoxIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SkeletonList } from "@/components/shared/loading-state";
import { fetchStock } from "../data/inventory-requests";
import { useStockActions } from "../data/use-stock-actions";
import type { StockItem } from "../types/inventory";
import { StockItemRow } from "./stock-item-row";
import { LoadFailedNotice } from "@/components/shared/inline-retry";
import { GhostLinkButton } from "@/components/shared/link-buttons";

type PlaceStockSectionProps = {
  placeId: string;
  /** Seed stock instead of fetching (stories). */
  initialItems?: StockItem[];
};

/**
 * What is kept in a room or zone, low stock first, with −1 / +1. Loads its own data (placeholder rows
 * first, an error with "Try again" if that fails); renders content only, so the place page wraps it in
 * its own card or section.
 */
export function PlaceStockSection({ placeId, initialItems }: PlaceStockSectionProps) {
  const { t } = useTranslation("inventory");
  const [items, setItems] = React.useState<StockItem[] | null>(initialItems ?? null);
  const [failed, setFailed] = React.useState(false);
  const seeded = Boolean(initialItems);

  const load = React.useCallback(async () => {
    try {
      setItems(await fetchStock({ placeId }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [placeId]);

  React.useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    fetchStock({ placeId })
      .then((next) => {
        if (cancelled) return;
        setItems(next);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [placeId, seeded]);

  const replace = React.useCallback(
    ({ stockItem }: { stockItem: StockItem }) =>
      setItems((previous) => previous?.map((item) => (item.id === stockItem.id ? stockItem : item)) ?? null),
    [],
  );
  const { adjust, isPending, show } = useStockActions({ onChanged: replace });

  if (items === null) {
    if (failed) {
      return <LoadFailedNotice message={t("loading.stockFailed")} onRetry={load} />;
    }
    return (
      <div role="status" aria-label={t("loading.stock")} className="rounded-xl border bg-card px-3">
        <SkeletonList rows={2} className="[&>div]:py-2.5" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("place.empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-3">
          {items.map((item) => (
            <StockItemRow
              key={item.id}
              item={show(item)}
              showPlace={false}
              pending={isPending(item.id)}
              onAdjust={(target, delta) => void adjust(target, delta, delta < 0 ? "scan_use" : "scan_add")}
            />
          ))}
        </ul>
      )}
      <GhostLinkButton to="/inventory" icon={BoxIcon} className="self-start text-muted-foreground">{t("page.title")}</GhostLinkButton>
    </div>
  );
}
