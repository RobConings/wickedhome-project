import * as React from "react";
import { EuroIcon, PackageIcon, ReceiptIcon, UnlinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoneyInput } from "./money-input";
import type { Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { createShoppingItem, updateShoppingItem } from "../data/shopping-requests";
import { useLiveShoppingItems, useShoppingCatalog } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import type { LinkPreview, Product, ShoppingItem } from "../types/shopping";
import { AddShoppingItemForm, type AddShoppingItemInput } from "./add-shopping-item-form";
import { ShoppingItemRow } from "./shopping-item-row";
import { ShoppingItemsError, ShoppingItemsSkeleton } from "./shopping-items-status";

type ProjectMaterialsPanelProps = {
  projectId: string;
  /** May add, price and remove materials. Everyone can tick them off. */
  canManage: boolean;
  /** New materials are "for" this room or zone (e.g. the project's first place). */
  placeId?: string | null;
  /** Called after any change, e.g. to refresh the project's budget. */
  onChange?: () => void;
  /** Seed data instead of fetching (stories). */
  initial?: { items: ShoppingItem[]; products: Product[]; shops: Shop[] };
  /** Reads pasted links; defaults to the API (stories). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Labels of the project's invoices (expenses) by id, e.g. "Toppy · 09/10/2026", for the "On invoice" chip. */
  invoices?: Record<string, string>;
  /** Takes a material off its invoice (projects feature, composed by the route); shows the unlink button. */
  onUnlinkInvoice?: (item: ShoppingItem & { expenseId: string }) => Promise<void>;
  /** Reloads the items when it changes (e.g. after materials were linked to an invoice elsewhere on the page). */
  refreshKey?: string;
};

/** Sets a material's (estimated) price per unit, for the project's budget. */
function PriceButton({ item, onSave }: { item: ShoppingItem; onSave: (priceCents: number | null) => Promise<void> }) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [cents, setCents] = React.useState<number | null>(item.priceCents);
  const [saving, setSaving] = React.useState(false);
  const inputId = React.useId();

  async function save() {
    setSaving(true);
    try {
      await onSave(cents);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (next) setCents(item.priceCents);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={t("project.setPrice", { name: item.name })}
          title={t("project.setPriceShort")}
        >
          <EuroIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {t("project.priceLabel")}
        </label>
        <MoneyInput
          id={inputId}
          defaultValueCents={item.priceCents}
          onValueChange={setCents}
          inputMode="decimal"
          placeholder="0,00"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
        <p className="text-xs text-muted-foreground">{t("project.priceHint")}</p>
        <Button type="button" size="sm" loading={saving} onClick={() => void save()}>
          {tCommon("actions.save")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * What a project needs to buy: its own shopping items and the materials of its tasks. Lives on the project's
 * page and loads its own data. New materials land on the materials list (like a task's) with the project
 * linked; a price per unit (from the webshop link, the product or typed in) feeds the project's budget.
 */
export function ProjectMaterialsPanel({
  projectId,
  canManage,
  placeId,
  onChange,
  initial,
  previewLink,
  invoices,
  onUnlinkInvoice,
  refreshKey,
}: ProjectMaterialsPanelProps) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const { items, setItems, failed, refresh } = useLiveShoppingItems({ projectId }, { initial: initial?.items });
  const { products, shops, loading: catalogLoading } = useShoppingCatalog(initial ? { products: initial.products, shops: initial.shops } : undefined);
  const afterChange = React.useCallback(() => {
    if (!initial) void refresh();
    onChange?.();
  }, [initial, refresh, onChange]);
  const actions = useShoppingItemActions({ items: items ?? NO_ITEMS, onChanged: afterChange });
  const shopsById = React.useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops]);
  const [unlinking, setUnlinking] = React.useState<string | null>(null);

  // Linked to an invoice from the expenses: reload (the first render already loaded).
  const seenKey = React.useRef(refreshKey);
  React.useEffect(() => {
    if (initial || seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    void refresh();
  }, [refreshKey, initial, refresh]);

  async function unlinkInvoice(item: ShoppingItem & { expenseId: string }) {
    if (!onUnlinkInvoice) return;
    setUnlinking(item.id);
    try {
      await onUnlinkInvoice(item);
      afterChange();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setUnlinking(null);
    }
  }

  async function add(input: AddShoppingItemInput) {
    try {
      const item = await createShoppingItem({ ...input, source: "task", projectId, placeId: placeId ?? undefined });
      setItems((previous) => [...(previous ?? []), item]);
      afterChange();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  async function setPrice(item: ShoppingItem, priceCents: number | null) {
    try {
      const { item: updated } = await updateShoppingItem(item.id, { priceCents });
      setItems((previous) => (previous ?? []).map((candidate) => (candidate.id === updated.id ? updated : candidate)));
      afterChange();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const visible = actions.items;
  const bought = visible.filter((item) => item.status === "bought").length;
  const estimate = visible
    .filter((item) => item.status === "open" && item.expenseId === null && item.priceCents !== null)
    .reduce((sum, item) => sum + Math.round((item.priceCents ?? 0) * item.quantity), 0);

  return (
    <div className="flex flex-col gap-3">
      {visible.length > 0 && (
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("task.progress", { bought, total: visible.length })}
          {estimate > 0 && <> · {t("project.toBuy", { amount: formatCurrency(estimate, locale) })}</>}
        </p>
      )}

      {items === null ? (
        failed ? (
          <ShoppingItemsError onRetry={refresh} />
        ) : (
          <ShoppingItemsSkeleton className="rounded-lg" />
        )
      ) : visible.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          <PackageIcon className="size-4 shrink-0" aria-hidden="true" />
          {canManage ? t("project.emptyManage") : t("project.empty")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card px-3">
          {visible.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              shop={item.shopId ? shopsById.get(item.shopId) : null}
              showSource={Boolean(item.taskId)}
              showProject={false}
              onToggle={(target) => void actions.toggle(target)}
              onDelete={canManage ? (target) => void actions.remove(target) : undefined}
              extraBadges={
                item.expenseId && (
                  <Badge variant="secondary" className="max-w-48 gap-1 font-normal">
                    <ReceiptIcon aria-hidden="true" />
                    <span className="truncate">
                      {invoices?.[item.expenseId] ? t("project.onInvoice", { label: invoices[item.expenseId] }) : t("project.onAnInvoice")}
                    </span>
                  </Badge>
                )
              }
              actions={
                canManage && (
                  <>
                    {item.expenseId && onUnlinkInvoice && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        loading={unlinking === item.id}
                        aria-label={t("project.unlinkInvoice", { name: item.name })}
                        title={t("project.unlinkInvoiceShort")}
                        onClick={() => void unlinkInvoice({ ...item, expenseId: item.expenseId as string })}
                      >
                        <UnlinkIcon />
                      </Button>
                    )}
                    <PriceButton item={item} onSave={(cents) => setPrice(item, cents)} />
                  </>
                )
              }
            />
          ))}
        </ul>
      )}

      {canManage && (
        <AddShoppingItemForm products={products} shops={shops} catalogLoading={catalogLoading} onAdd={add} previewLink={previewLink} />
      )}
    </div>
  );
}

const NO_ITEMS: ShoppingItem[] = [];
