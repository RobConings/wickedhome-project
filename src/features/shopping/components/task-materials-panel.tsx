import * as React from "react";
import { PackageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Shop } from "@/features/shops";
import { createShoppingItem } from "../data/shopping-requests";
import { useLiveShoppingItems, useShoppingCatalog } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import type { LinkPreview, Product, ShoppingItem } from "../types/shopping";
import { AddShoppingItemForm, type AddShoppingItemInput } from "./add-shopping-item-form";
import { ShoppingItemRow } from "./shopping-item-row";
import { ShoppingItemsError, ShoppingItemsSkeleton } from "./shopping-items-status";
import { EmptyNote } from "@/components/shared/empty-note";

type TaskMaterialsPanelProps = {
  taskId: string;
  /** May add and remove materials (owner/adult, or whoever may edit the task). Everyone can tick them off. */
  canManage: boolean;
  /** The task's place: new materials are "for" that room or zone. */
  placeId?: string | null;
  /** Called after any change, e.g. to refresh the task's "waiting for materials (n/m)". */
  onChange?: () => void;
  /** Seed data instead of fetching (stories). */
  initial?: { items: ShoppingItem[]; products: Product[]; shops: Shop[] };
  /** Reads pasted links; defaults to the API (stories). */
  previewLink?: (url: string) => Promise<LinkPreview>;
};

/**
 * What a task needs, as shopping items linked to it. Lives on the task's page: loads its own data, adds
 * materials (from the catalogue, by name or by pasting a webshop link) with a preferred shop, and ticks
 * them off. The items also show up on the shopping lists and in the shop view.
 */
export function TaskMaterialsPanel({ taskId, canManage, placeId, onChange, initial, previewLink }: TaskMaterialsPanelProps) {
  const { t } = useTranslation("shopping");
  const { items, setItems, failed, refresh } = useLiveShoppingItems({ taskId }, { initial: initial?.items });
  const { products, shops, loading: catalogLoading } = useShoppingCatalog(initial ? { products: initial.products, shops: initial.shops } : undefined);
  const afterChange = React.useCallback(() => {
    if (!initial) void refresh();
    onChange?.();
  }, [initial, refresh, onChange]);
  const actions = useShoppingItemActions({ items: items ?? NO_ITEMS, onChanged: afterChange });
  const shopsById = React.useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops]);

  async function add(input: AddShoppingItemInput) {
    try {
      const item = await createShoppingItem({ ...input, source: "task", taskId, placeId: placeId ?? undefined });
      setItems((previous) => [...(previous ?? []), item]);
      afterChange();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const visible = actions.items;
  const bought = visible.filter((item) => item.status === "bought").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{t("task.title")}</h3>
        {visible.length > 0 && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("task.progress", { bought, total: visible.length })}
          </span>
        )}
      </div>

      {items === null ? (
        failed ? (
          <ShoppingItemsError onRetry={refresh} />
        ) : (
          <ShoppingItemsSkeleton className="rounded-lg" />
        )
      ) : visible.length === 0 ? (
        <EmptyNote icon={PackageIcon}>{canManage ? t("task.emptyManage") : t("task.empty")}</EmptyNote>
      ) : (
        <ul className="divide-y rounded-lg border bg-card px-3">
          {visible.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              shop={item.shopId ? shopsById.get(item.shopId) : null}
              showSource={false}
              onToggle={(target) => void actions.toggle(target)}
              onDelete={canManage ? (target) => void actions.remove(target) : undefined}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <AddShoppingItemForm
          products={products}
          shops={shops}
          catalogLoading={catalogLoading}
          onAdd={add}
          previewLink={previewLink}
        />
      )}
    </div>
  );
}

const NO_ITEMS: ShoppingItem[] = [];
