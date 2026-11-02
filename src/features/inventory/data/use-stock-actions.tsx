import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { StockPurchaseInput, StockPurchaseReview } from "../types/purchases";
import { isBelowMinimum, type StockChangeResult, type StockItem, type StockMovementReason } from "../types/inventory";
import { fetchPurchaseReview, recordStockPurchase, addStockMovement } from "./inventory-requests";

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
  const { reconcile, confirmation, confirmationPending } = usePurchaseReconciliation();
  const active = React.useRef(new Set<string>());
  const [pending, setPending] = React.useState<string[]>([]);
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
      if (active.current.size) return null;
      active.current.add(item.id); setPending([...active.current]);
      const optimistic = delta < 0;
      if (optimistic) shift(item.id, delta);
      try {
        let result: StockChangeResult;
        if (delta > 0 && (reason === "scan_add" || reason === "bought")) {
          const operation: StockPurchaseInput = { quantity: delta, source: { kind: "scan", reference: crypto.randomUUID() } };
          const outcome = await reconcile(item.productName, delta, async (decision) => recordStockPurchase(item.id, { ...operation, ...decision }), item.id);
          if (!outcome) return null;
          result = outcome;
        } else result = await addStockMovement(item.id, { delta, reason });
        if (result.addedToShoppingList) toast(t("lowStock.addedToList", { name: item.productName }));
        if (result.purchase?.added === 0) toast.success(t("purchase.alreadyAdded", { name: item.productName }));
        try { await onChanged?.(result); } catch { /* Refresh on next visit; write was committed. */ }
        return result;
      } catch {
        toast.error(t("errors.generic")); return null;
      } finally {
        if (optimistic) shift(item.id, -delta);
        active.current.delete(item.id); setPending([...active.current]);
      }
    },
    [onChanged, shift, t, reconcile],
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
    isPending: (id: string) => pending.includes(id),
    confirmationPending, confirmation,

  };
}

/** Plain language reconciliation shared by ticks, manual additions and scans. */
export function usePurchaseReconciliation() {
  const { t } = useTranslation("inventory");
  const [review, setReview] = React.useState<{ name: string; quantity: number; data: StockPurchaseReview; countReview: boolean; resolve: (choice: Partial<StockPurchaseInput> | null) => void } | null>(null);
  const requestChoice = React.useCallback((name: string, quantity: number, data: StockPurchaseReview, countReview: boolean) => new Promise<Partial<StockPurchaseInput> | null>((resolve) => {
    setReview({ name, quantity, data, countReview, resolve });
  }), []);
  const choose = (choice: Partial<StockPurchaseInput> | null) => { review?.resolve(choice); setReview(null); };


  const pendingChoice = React.useRef<((choice: null) => void) | null>(null);
  React.useEffect(() => { pendingChoice.current = review?.resolve ?? null; }, [review]);
  React.useEffect(() => () => { pendingChoice.current?.(null); }, []);
  const reconcile = React.useCallback(async <T,>(name: string, quantity: number, execute: (decision: Partial<StockPurchaseInput>) => Promise<T>, stockItemId?: string): Promise<T | null> => {
    const decision: Partial<StockPurchaseInput> = {};
    for (;;) {
      try { return await execute(decision); }
      catch (error) {
        if (!(error instanceof ApiRequestError) || !["purchase_review", "purchase_count_review"].includes(error.code)) throw error;
        const id = stockItemId ?? error.fields?.stockItemId?.[0];
        if (!id) throw error;
        const data = await fetchPurchaseReview(id);
        const choice = await requestChoice(name, quantity, data, error.code === "purchase_count_review");
        if (!choice) return null;
        Object.assign(decision, choice);
      }
    }
  }, [requestChoice]);
  return { reconcile, confirmationPending: Boolean(review), confirmation: <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open) choose(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>{t(review?.countReview ? "purchase.countTitle" : "purchase.title")}</DialogTitle><DialogDescription>{t(review?.countReview ? "purchase.countQuestion" : "purchase.question", { name: review?.name })}</DialogDescription></DialogHeader>
      {review?.countReview ? <><Button onClick={() => choose({ countDisposition: "already_counted" })}>{t("purchase.included")}</Button><Button variant="outline" onClick={() => choose({ countDisposition: "add_after_count" })}>{t("purchase.notIncluded")}</Button></> : <>
        {review?.data.purchases.filter((purchase) => purchase.quantity >= review.quantity).map((purchase) => <Button key={purchase.id} variant="outline" className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => choose({ existingPurchaseIds: [purchase.id] })}>{t("purchase.same", { quantity: purchase.quantity, unit: purchase.unit ?? "", date: new Date(purchase.purchasedAt).toLocaleString(), shop: purchase.shopName ?? t("purchase.unknownShop") })}</Button>)}
        <Button onClick={() => choose({ separatePurchaseConfirmed: true })}>{t("purchase.extra", { quantity: review?.quantity })}</Button>
      </>}
      <Button variant="ghost" onClick={() => choose(null)}>{t("purchase.cancel")}</Button>
    </DialogContent></Dialog> };
}
