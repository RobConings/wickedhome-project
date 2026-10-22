import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isBelowMinimum, type StockChangeResult, type StockItem, type StockMovementReason } from "../types/inventory";
import { addStockMovement } from "./inventory-requests";

type Options = {
  /**
   * Called after a change was saved, to bring the data on screen up to date (revalidate, or replace the
   * item). Return a promise (e.g. `revalidator.revalidate()`) when that takes a while: the optimistic
   * amount stays until it settles, so the number doesn't jump back in between.
   */
  onChanged?: (result: StockChangeResult) => void | Promise<unknown>;
};

/**
 * Use one / add one straight against the API, optimistically: `show(item)` returns the item with the
 * changes still on their way already applied, so −1 / +1 respond at once (also when tapped quickly in a
 * row). A failed change is taken back with a toast. Tells the user when the change put the product on
 * the shopping list because it dropped below its minimum.
 */
export function useStockActions({ onChanged }: Options = {}) {
  const { t } = useTranslation("inventory");
  // Sum of the changes per stock item that are not on screen from the server yet.
  const [deltas, setDeltas] = React.useState<Record<string, number>>({});

  const shift = React.useCallback((id: string, delta: number) => {
    setDeltas((previous) => {
      const next = { ...previous, [id]: (previous[id] ?? 0) + delta };
      if (Math.abs(next[id] ?? 0) < 1e-9) delete next[id];
      return next;
    });
  }, []);

  const adjust = React.useCallback(
    async (item: Pick<StockItem, "id" | "productName">, delta: number, reason: StockMovementReason) => {
      shift(item.id, delta);
      try {
        const result = await addStockMovement(item.id, { delta, reason });
        if (result.addedToShoppingList) toast(t("lowStock.addedToList", { name: item.productName }));
        try {
          await onChanged?.(result);
        } catch {
          // The change itself was saved; the data on screen refreshes next time.
        }
        return result;
      } catch {
        toast.error(t("errors.generic"));
        return null;
      } finally {
        shift(item.id, -delta);
      }
    },
    [onChanged, shift, t],
  );

  const show = React.useCallback(
    <T extends StockItem>(item: T): T => {
      const delta = deltas[item.id];
      if (!delta) return item;
      const quantity = Math.max(0, item.quantity + delta);
      return { ...item, quantity, isLow: isBelowMinimum(quantity, item.minQuantity) };
    },
    [deltas],
  );

  return {
    adjust,
    /** The item with its unsaved changes applied (optimistic). */
    show,
    /** A change for this item is on its way to the server. */
    isPending: (id: string) => id in deltas,
  };
}
