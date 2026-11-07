import { usePurchaseReconciliation } from "@/features/inventory";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { currentLocale } from "@/lib/i18n";
import { formatQuantity, type ShoppingItem, type ShoppingItemStatus } from "../types/shopping";
import { deleteShoppingItem, updateShoppingItem } from "./shopping-requests";
import { combineShoppingItems } from "../types/shopping-product-rows";

type Options = {
  /** The items on screen; a new array (fresh data) drops optimistic ticks. */
  items: ShoppingItem[];
  /** Called after a change was saved, e.g. to revalidate or refetch. */
  onChanged?: () => void;
};

/**
 * Tick off, untick and delete items straight against the API, with the tick shown immediately. When a
 * bought product has a known stock location/unit, the server credits its acquisition once.
 */
export function useShoppingItemActions({ items: suppliedItems, onChanged }: Options) {
  const { reconcile, confirmation } = usePurchaseReconciliation();
  const active = React.useRef(new Set<string>());
  const items = React.useMemo(() => combineShoppingItems(suppliedItems), [suppliedItems]);
  const { t } = useTranslation("shopping");
  const [overrides, setOverrides] = React.useState<Record<string, ShoppingItemStatus>>({});
  const [removed, setRemoved] = React.useState<string[]>([]);
  // Items with a change still being saved.
  const [saving, setSaving] = React.useState<string[]>([]);
  const [seenItems, setSeenItems] = React.useState(items);

  // Fresh data from the server wins over optimistic state (adjusting state during render, not in an effect),
  // except for changes still being saved: a refresh that started before the save would undo the tick.
  if (seenItems !== items) {
    setSeenItems(items);
    setOverrides((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => saving.includes(id))));
    setRemoved((previous) => previous.filter((id) => saving.includes(id)));
  }

  const track = React.useCallback(async (id: string, work: () => Promise<void>) => {
    setSaving((previous) => [...previous, id]);
    try {
      await work();
    } finally {
      setSaving((previous) => {
        const index = previous.indexOf(id);
        return index === -1 ? previous : [...previous.slice(0, index), ...previous.slice(index + 1)];
      });
    }
  }, []);

  const toggle = React.useCallback(
    async (item: ShoppingItem) => {
      if (active.current.size) return;
      active.current.add(item.id);
      const current = overrides[item.id] ?? item.status;
      const next: ShoppingItemStatus = current === "open" ? "bought" : "open";
      setOverrides((previous) => ({ ...previous, [item.id]: next }));
      await track(item.id, async () => {
        try {
          const result = next === "bought"
            ? await reconcile(item.name, item.quantity, (purchaseDecision) => updateShoppingItem(item.id, { status: next, purchaseDecision, expectedUpdatedAt: item.updatedAt }))
            : await updateShoppingItem(item.id, { status: next, expectedUpdatedAt: item.updatedAt });
          if (!result) { await updateShoppingItem(item.id, { status: "open" }); onChanged?.(); return; }
          if (result.restock && result.stock?.added) toast.success(t("restock.addedAutomatically", { name: item.name, quantity: formatQuantity(result.stock.added, currentLocale()), unit: result.restock.unit ?? "", place: result.restock.placeName }));
          else if (result.stock?.added === 0) toast.success(t("restock.alreadyProcessed"));
          else if (next === "bought" && item.productId && !result.restock) toast(t("restock.notAdded"));
          else if (next === "open") toast(t("restock.unticked"));
          onChanged?.();
        } catch {
          setOverrides((previous) => ({ ...previous, [item.id]: current }));
          toast.error(t("errors.generic"));
          onChanged?.();
        }
      });
      active.current.delete(item.id);
    },
    [reconcile, overrides, onChanged, t, track],
  );

  const skip = React.useCallback(async (item: ShoppingItem) => {
    try { await updateShoppingItem(item.id, { status: "skipped" }); onChanged?.(); }
    catch { toast.error(t("errors.generic")); }
  }, [onChanged, t]);

  const remove = React.useCallback(
    async (item: ShoppingItem) => {
      setRemoved((previous) => [...previous, item.id]);
      await track(item.id, async () => {
        try {
          await deleteShoppingItem(item.id);
          onChanged?.();
        } catch {
          setRemoved((previous) => previous.filter((id) => id !== item.id));
          toast.error(t("errors.generic"));
        }
      });
    },
    [onChanged, t, track],
  );

  const visible = React.useMemo(
    () =>
      items
        .filter((item) => !removed.includes(item.id))
        .map((item) => (overrides[item.id] && overrides[item.id] !== item.status ? { ...item, status: overrides[item.id] as ShoppingItemStatus } : item)),
    [items, removed, overrides],
  );

  /** `saving`: ids of items with a change on its way to the server (already shown optimistically). */
  return { items: visible, toggle, skip, remove, saving, confirmation };
}
