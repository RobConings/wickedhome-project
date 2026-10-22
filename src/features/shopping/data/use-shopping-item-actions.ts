import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { currentLocale } from "@/lib/i18n";
import { formatQuantity, type ShoppingItem, type ShoppingItemStatus } from "../types/shopping";
import { deleteShoppingItem, restockShoppingItem, updateShoppingItem } from "./shopping-requests";

type Options = {
  /** The items on screen; a new array (fresh data) drops optimistic ticks. */
  items: ShoppingItem[];
  /** Called after a change was saved, e.g. to revalidate or refetch. */
  onChanged?: () => void;
};

/**
 * Tick off, untick and delete items straight against the API, with the tick shown immediately. When a
 * bought item's product is kept in stock, a toast offers to add it there.
 */
export function useShoppingItemActions({ items, onChanged }: Options) {
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

  const offerRestock = React.useCallback(
    (item: ShoppingItem, restock: NonNullable<Awaited<ReturnType<typeof updateShoppingItem>>["restock"]>) => {
      const quantity = formatQuantity(restock.quantity, currentLocale());
      toast(t("restock.prompt", { name: item.name, place: restock.placeName }), {
        duration: 10_000,
        action: {
          label: t("restock.add", { quantity, unit: restock.unit ?? "" }).trim(),
          onClick: () =>
            void restockShoppingItem(item.id, { stockItemId: restock.stockItemId, quantity: restock.quantity })
              .then(() => toast.success(t("restock.done", { name: item.name, place: restock.placeName })))
              .catch(() => toast.error(t("errors.generic"))),
        },
      });
    },
    [t],
  );

  const toggle = React.useCallback(
    async (item: ShoppingItem) => {
      const current = overrides[item.id] ?? item.status;
      const next: ShoppingItemStatus = current === "open" ? "bought" : "open";
      setOverrides((previous) => ({ ...previous, [item.id]: next }));
      await track(item.id, async () => {
        try {
          const result = await updateShoppingItem(item.id, { status: next });
          if (result.restock) offerRestock(item, result.restock);
          onChanged?.();
        } catch {
          setOverrides((previous) => ({ ...previous, [item.id]: current }));
          toast.error(t("errors.generic"));
        }
      });
    },
    [overrides, offerRestock, onChanged, t, track],
  );

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
  return { items: visible, toggle, remove, saving };
}
