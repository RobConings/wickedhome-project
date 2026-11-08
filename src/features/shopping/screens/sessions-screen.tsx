import { useShoppingSort } from "../data/use-shopping-sort";
import { ShoppingSortField } from "../components/shopping-sort-field";
import { ShoppingNavigation } from "../components/shopping-navigation";
import { formatCurrency } from "@/lib/format";
import { CheckIcon, CircleIcon, ShoppingBagIcon } from "lucide-react";
import { RecordImage } from "@/components/shared/record-image";
import { RecordProgress } from "@/components/shared/record-progress";
import { RecordLink } from "@/components/shared/record-link";
import { SessionExtraDialog } from "../components/session-extra-dialog";
import { SessionStartCard } from "../components/session-start-card";
import { SessionItemAdjustDialog } from "../components/session-item-adjust-dialog";
import { ShoppingNeedSections } from "../components/shopping-need-sections";
import { ShoppingStockFilterField } from "../components/shopping-stock-filter";
import { visitRequirements } from "../types/shopping-product-rows";
import { SessionPayments } from "../components/session-payments";
import { useLiveEventsStatus } from "@/lib/live-events";
import { useCategoryOrder } from "../data/use-category-order";
import * as React from "react";
import { Link, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardTitle } from "@/components/shared/card";
import { uploadDocument } from "@/features/documents";
import { formatDate } from "@/types/date-format";
import { currentLocale } from "@/lib/i18n";
import { startOfDayIn, todayIn } from "@/types/dates";
import type { ShoppingPageData } from "../data/shopping-loaders";
import type {
  SessionItem,
  SessionSummary,
  SessionView,
} from "../types/sessions";
import {
  AutomaticShoppingFilter,
  CategoryOrder,
} from "../components/shopping-preferences";
import {
  groupChecklistItems,
  parseStockFilter,
  matchesStockFilter,
  type ShoppingStockFilter,
} from "../components/shopping-grouping";
import {
  attachReceipt,
  closeSession,
  joinSession,
  planShoppingVisit,
  reconcileReceipt,
  startShoppingSession,
  updateSessionItem,
} from "../data/sessions-requests";
import { useLiveRevalidation } from "../data/use-live-shopping";

type Props = {
  shopping: ShoppingPageData;
  sessions: SessionSummary[];
  session: SessionView | null;
  canManage: boolean;
  live?: boolean;
  initialSelections?: React.ComponentProps<typeof SessionStartCard>["initialSelections"];
};
const selectClass =
  "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
const field = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? "");

export function SessionsScreen({
  shopping,
  sessions,
  session,
  canManage, live = true, initialSelections,
}: Props) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const { order, change } = useCategoryOrder();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  useLiveRevalidation(live ? 10_000 : null);
  const liveStatus = useLiveEventsStatus();
  const [busy, setBusy] = React.useState(false);
  const [includeLowStock, setIncludeLowStock] = React.useState(true);
  const [selected, setSelected] = React.useState<string[]>([]);

  const [params, setParams] = useSearchParams();
  const stockFilter = parseStockFilter(params.get("stock"));
  const setStockFilter = (value: ShoppingStockFilter) => setParams((current) => { if (value === "all") current.delete("stock"); else current.set("stock", value); return current; }, { preventScrollReset: true });
  const { sort, changeSort } = useShoppingSort();
  const [destination, setDestination] = React.useState<string | null>(params.get("destination"));
  const groupId = destination?.startsWith("group:") ? destination.slice(6) : "";
  const selectedShops = groupId ? shopping.shopGroups?.find((group) => group.id === groupId)?.shopIds ?? [] : destination?.startsWith("shop:") ? [destination.slice(5)] : [];

  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.generic"));
    } finally {
      await revalidator.revalidate();
      setBusy(false);
    }
  };
  const open = visitRequirements(
    shopping.overview.items.filter((item) => item.status === "open"),
    includeLowStock,
    new Map(shopping.products.map((product) => [product.id, product])),
  ).filter((item) => matchesStockFilter(item, stockFilter));
  const active = session?.status === "active";
  const title = session?.name ?? t("sessions.title");
  const renderItem = (item: SessionItem) =>
    session && (
      <SessionItemForm
        key={item.id}
        item={item}
        session={session}
        shopping={shopping}
        disabled={busy || !active}
        onChange={(input) =>
          perform(() =>
            updateSessionItem(session.id, item.id, {
              ...input,
              revision: item.revision,
              operationId: crypto.randomUUID(),
            }),
          )
        }
      />
    );
  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={
          session
            ? `${formatDate(session.startedAt, locale)} · ${session.participants.map((part) => part.name).join(", ")}`
            : t("sessions.description")
        }
      />
      <ShoppingNavigation />
      <ShoppingSortField value={sort} onChange={changeSort} />
      <p role="status" className="text-xs text-muted-foreground">
        {t(`sessions.live_${liveStatus}`)}
      </p>
      {session && active && (
        <ShoppingStockFilterField
          value={stockFilter}
          onChange={setStockFilter}
        />
      )}
      {stockFilter !== "all" &&
        (!session
          ? open.length === 0
          : active &&
            !session.items.some(
              (item) =>
                item.status === "open" && matchesStockFilter(item, stockFilter),
            )) && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("shopView.filters.noResults")}
          </p>
        )}
      {!session ? (
        <>
          {canManage && <SessionStartCard shopping={shopping} destination={destination} onDestinationChange={setDestination} initialSelections={initialSelections} />}
          {canManage && (
            <details className="rounded-xl border p-4">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">{t("sessions.advancedPlanning")}</summary>
            <Card className="space-y-4 border-0 p-0 shadow-none">
              <CardTitle>{t("sessions.plan")}</CardTitle>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void perform(planShoppingVisit)}
              >
                {t("sessions.refreshNeeds")}
              </Button>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  void perform(async () => {
                    const result = await startShoppingSession({
                      operationId: crypto.randomUUID(),
                      name: field(form, "name"),
                      shopIds: selectedShops,
                      shopGroupId: groupId || undefined,
                      requirementIds: selected.filter((id) =>
                        open.some((item) => item.id === id),
                      ),
                      includeLowStock,
                    });
                    await navigate(`/shopping/sessions/${result.id}`);
                  });
                }}
              >
                <label className="block text-sm">
                  {t("fields.name")}
                  <Input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={`${t("sessions.visit")} ${formatDate(todayIn(), locale)}`}
                  />
                </label>
                <AutomaticShoppingFilter
                  included={includeLowStock}
                  onChange={setIncludeLowStock}
                />
                <CategoryOrder order={order} onChange={change} />
                <ShoppingStockFilterField value={stockFilter} onChange={setStockFilter} />
                <div className="space-y-4">
                  {groupChecklistItems(open, sort, order, locale).map((group) => (
                    <fieldset key={group.key}>
                      <legend className="font-medium">
                        {group.key === "all" ? t("shopView.sort.name") : t(`categories.${group.key}`)}
                      </legend>
                      <ShoppingNeedSections grouped={sort === "category"} items={group.items}>
                        {(items) =>
                          items.map((item) => (
                            <label
                              key={item.id}
                              className="flex min-h-12 items-center gap-3 border-b text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selected.includes(item.id)}
                                onChange={(event) =>
                                  setSelected((ids) =>
                                    event.target.checked
                                      ? [...ids, item.id]
                                      : ids.filter((id) => id !== item.id),
                                  )
                                }
                              />
                              <span>
                                {item.name}{" "}
                                <span className="text-muted-foreground">
                                  {item.quantity} {item.unit} ·{" "}
                                  {[
                                    ...new Set(
                                      (item.requirements ?? [item]).map(
                                        (part) => t(`source.${part.source}`),
                                      ),
                                    ),
                                  ].join(", ")}
                                </span>
                              </span>
                            </label>
                          ))
                        }
                      </ShoppingNeedSections>
                    </fieldset>
                  ))}
                </div>
                <Button disabled={busy} type="submit">
                  {t("sessions.start", {
                    count: selected.filter((id) =>
                      open.some((item) => item.id === id),
                    ).length,
                  })}
                </Button>
              </form>
            </Card>
            </details>
          )}
          <Card className="space-y-3">
            <CardTitle>{t("sessions.history")}</CardTitle>
            {sessions.map((visit) => (
              <Link
                className="flex min-h-12 items-center justify-between gap-2 border-b text-sm"
                key={visit.id}
                to={`/shopping/sessions/${visit.id}`}
              >
                <span>
                  {visit.name} · {formatDate(visit.startedAt, locale)}
                </span>
                <span>{t(`sessions.${visit.status}`)}</span>
              </Link>
            ))}
            {!sessions.length && <p>{t("sessions.noHistory")}</p>}
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border px-3 py-2 text-sm">
              {t(`sessions.${session.status}`)}
            </span>
            {active && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void perform(() => joinSession(session.id))}
              >
                {t("sessions.join")}
              </Button>
            )}
            {active && canManage && (
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(() => closeSession(session.id, session.revision))
                }
              >
                {t("sessions.close")}
              </Button>
            )}
          </div>
          <RecordProgress label={t("sessions.progress")} completed={session.items.filter((item) => item.status !== "open").length} total={session.items.length}
            summary={t("sessions.progressSummary", { bought: session.items.filter((item) => item.status === "bought").length, skipped: session.items.filter((item) => item.status === "skipped").length })} />
          {active && <CategoryOrder order={order} onChange={change} />}
          {!active && <Card className="space-y-2"><CardTitle>{t("sessions.finishedTitle")}</CardTitle><p className="text-sm text-muted-foreground">{t("sessions.finishedHint")}</p></Card>}
          {groupChecklistItems(session.items.filter((item) => item.status === "open" && matchesStockFilter(item, stockFilter)), sort, order, locale).map((group) => (
            <Card className="space-y-3" key={group.key}>
              <CardTitle>{group.key === "all" ? t("shopView.sort.name") : t(`categories.${group.key}`)}</CardTitle>
              <ShoppingNeedSections grouped={sort === "category"} items={group.items}>{(items) => items.map(renderItem)}</ShoppingNeedSections>
            </Card>
          ))}
          {(["bought", "skipped"] as const).map((status) => {
            const items = session.items.filter(
              (item) => item.status === status,
            );
            return (
              items.length > 0 && (
                <details
                  key={status}
                  data-item-status={status}
                  className="space-y-3 rounded-xl border bg-card p-3"
                >
                  <summary className="min-h-11 cursor-pointer py-3 font-medium">
                    {t(`sessions.item_${status}`)} ({items.length})
                  </summary>
                  {items
                    .sort((a, b) => a.name.localeCompare(b.name, locale))
                    .map(renderItem)}
                </details>
              )
            );
          })}
          {(active ||
            (canManage &&
              session.purchases.some(
                (purchase) => purchase.receipts.length > 0,
              ))) && (
            <SessionExtraDialog products={shopping.products} disabled={busy} />
          )}

          {session.purchases.map((purchase) => (
            <Card key={purchase.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{t("sessions.purchase")}</CardTitle><Button asChild variant="outline"><RecordLink to={`/purchases/${purchase.id}`}><ShoppingBagIcon />{t("sessions.openPurchase")}</RecordLink></Button></div>
              <p className="text-sm text-muted-foreground">
                {t("sessions.stockHint")}
              </p>
              {purchase.lines.map((line) => (
                <p className="text-sm" key={line.id}>
                  {line.name} · {line.purchasedQuantity ?? line.quantity} {line.purchasedQuantity != null ? line.purchasedUnit : line.unit} ·{" "}
                  {t(
                    line.stockAdded
                      ? "sessions.stockCredited"
                      : "sessions.untracked",
                  )}
                </p>
              ))}
              {purchase.receipts.map((receipt) => (
                <div
                  className="space-y-3 rounded-lg border p-3"
                  key={receipt.id}
                >
                  <a
                    className="break-all text-sm underline"
                    href={
                      receipt.documentId
                        ? `/api/documents/files/${receipt.documentId}/content`
                        : "/documents"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {receipt.filename}
                  </a>
                  <p className="text-sm">
                    {
                      shopping.shops.find((shop) => shop.id === receipt.shopId)
                        ?.name
                    }{" "}
                    · {formatDate(receipt.purchasedAt, locale)}
                    {receipt.totalCents !== null
                      ? ` · ${formatCurrency(receipt.totalCents, locale)}`
                      : ""}
                  </p>
                  {canManage && (
                    <details className="space-y-3">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm">
                        {t("sessions.match")}
                      </summary>
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = event.currentTarget;
                          void perform(() =>
                            reconcileReceipt(session.id, receipt.id, {
                              sessionItemId: field(form, "itemId"),
                              reference: field(form, "reference"),
                              quantity: Number(field(form, "quantity")),
                              stockItemId:
                                field(form, "stockItemId") || undefined,
                              acceptDifference: new FormData(form).has(
                                "acceptDifference",
                              ),
                              existingPurchaseIds: new FormData(form).getAll(
                                "purchaseIds",
                              ).length
                                ? new FormData(form)
                                    .getAll("purchaseIds")
                                    .map(String)
                                : undefined,
                              countDisposition: (field(
                                form,
                                "countDisposition",
                              ) || undefined) as
                                | "already_counted"
                                | "add_after_count"
                                | undefined,
                            }),
                          );
                        }}
                      >
                        <label className="text-sm">
                          {t("sessions.matchProduct")}
                          <select
                            name="itemId"
                            className={selectClass}
                            required
                          >
                            {session.items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.purchasedQuantity}/
                                {item.quantity})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          {t("sessions.matchAcquisitions")}
                          <select
                            name="purchaseIds"
                            multiple
                            className={selectClass}
                          >
                            {purchase.lines.map((line) => (
                              <option key={line.id} value={line.id}>
                                {
                                  session.items.find(
                                    (item) => item.id === line.sessionItemId,
                                  )?.name
                                }{" "}
                                · {line.purchasedQuantity ?? line.quantity} {line.purchasedQuantity != null ? line.purchasedUnit : line.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          {t("sessions.stockLocation")}
                          <select name="stockItemId" className={selectClass}>
                            <option value="">
                              {t("sessions.chooseLocation")}
                            </option>
                            {session.stockOptions.map((stock) => (
                              <option key={stock.id} value={stock.id}>
                                {
                                  shopping.products.find(
                                    (product) => product.id === stock.productId,
                                  )?.name
                                }{" "}
                                · {stock.placeName} · {stock.unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm">
                          {t("sessions.countDisposition")}
                          <select
                            name="countDisposition"
                            className={selectClass}
                          >
                            <option value="">
                              {t("sessions.countUnknown")}
                            </option>
                            <option value="already_counted">
                              {t("sessions.alreadyCounted")}
                            </option>
                            <option value="add_after_count">
                              {t("sessions.addAfterCount")}
                            </option>
                          </select>
                        </label>
                        <label className="text-sm">
                          {t("sessions.receiptLine")}
                          <Input name="reference" required maxLength={100} />
                        </label>
                        <label className="text-sm">
                          {t("sessions.receiptQuantity")}
                          <Input
                            name="quantity"
                            required
                            type="number"
                            min="0.001"
                            step="0.001"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input name="acceptDifference" type="checkbox" />
                          {t("sessions.acceptDifference")}
                        </label>
                        <Button disabled={busy}>{t("sessions.match")}</Button>
                      </form>
                    </details>
                  )}
                </div>
              ))}
              {canManage && (
                <details className="space-y-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm">
                    {t("sessions.attachReceipt")}
                  </summary>
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const file = new FormData(form).get("receipt");
                      if (!(file instanceof File) || !file.size) return;
                      const date = field(form, "date");
                      const total = field(form, "total");
                      void perform(async () => {
                        const document = await uploadDocument(file);
                        return attachReceipt(session.id, {
                          documentId: document.id,
                          shopId: field(form, "shopId") || undefined,
                          purchasedAt: startOfDayIn(date).toISOString(),
                          totalCents: total
                            ? Math.round(Number(total) * 100)
                            : undefined,
                        });
                      });
                    }}
                  >
                    <label className="text-sm">
                      {t("fields.shop")}
                      <select
                        name="shopId"
                        className={selectClass}
                        defaultValue={purchase.shopId ?? ""}
                        required
                      >
                        <option value="">{t("sessions.chooseShops")}</option>
                        {shopping.shops.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      {t("sessions.receipt")}
                      <Input
                        name="receipt"
                        type="file"
                        accept="image/*,application/pdf"
                        required
                      />
                    </label>
                    <label className="text-sm">
                      {t("sessions.receiptDate")}
                      <Input
                        name="date"
                        type="date"
                        defaultValue={todayIn(undefined, new Date(purchase.purchasedAt))}
                        required
                      />
                    </label>
                    <label className="text-sm">
                      {t("sessions.total")}
                      <Input name="total" type="number" step="0.01" min="0" />
                    </label>
                    <Button disabled={busy}>
                      {t("sessions.attachReceipt")}
                    </Button>
                  </form>
                </details>
              )}
              {canManage && (
                <SessionPayments
                  payeeDefault={
                    shopping.shops.find(
                      (shop) =>
                        shop.id ===
                        (purchase.receipts.length === 1
                          ? purchase.receipts[0]!.shopId
                          : purchase.shopId),
                    )?.name ?? session.name
                  }
                  session={session}
                  purchase={purchase}
                  disabled={busy}
                />
              )}
            </Card>
          ))}
        </>
      )}
    </PageContainer>
  );
}

function SessionItemForm({
  item,
  session,
  shopping,
  disabled,
  onChange,
}: {
  item: SessionItem;
  session: SessionView;
  shopping: ShoppingPageData;
  disabled: boolean;
  onChange: (
    input: Omit<
      Parameters<typeof updateSessionItem>[2],
      "revision" | "operationId"
    >,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("shopping");
  const [adjusting, setAdjusting] = React.useState<SessionItem | null>(null);
  const product = shopping.products.find(
    (product) => product.id === item.productId,
  );
  const stocks = session.stockOptions.filter(
    (stock) => stock.productId === (product?.stockProductId ?? item.productId),
  );
  const values = (form: HTMLFormElement) => ({
    quantity: item.quantity,
    stockItemId: field(form, "stockItemId") || undefined,
  });
  return (
    <>
    <form
      className="space-y-3 rounded-xl border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        void onChange({
          ...values(form),
          status: "bought",
          purchasedQuantity: Number(field(form, "purchasedQuantity")),
        });
      }}
    >
      <div className="flex items-center gap-3">
      <RecordImage src={product?.imageUrl} alt="" shape="avatar" fit="contain" className="size-14 shrink-0 rounded-xl bg-background" />
      <p className="min-w-0 flex-1 font-medium">
        {item.name}{" "}
        <span className="ml-2 text-xs text-muted-foreground">
          {t(
            session.status === "closed" && item.status === "open"
              ? "sessions.pendingReceipt"
              : `sessions.item_${item.status}`,
          )}{" "}
          · {item.purchasedQuantity}/{item.quantity} {item.unit}
        </span>
      </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.status !== "bought" && (
          <Button disabled={disabled} type="submit">
            <CircleIcon />{t("sessions.buy")}
          </Button>
        )}
        {item.status !== "bought" && (
          <Button
            disabled={disabled}
            variant="outline"
            type="button"
            onClick={() =>
              void onChange({
                status: item.status === "skipped" ? "open" : "skipped",
              })
            }
          >
            {t(
              item.status === "skipped" ? "planning.restore" : "planning.skip",
            )}
          </Button>
        )}
        {item.status === "bought" && <span className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-medium text-section"><CheckIcon className="size-5" />{t("sessions.item_bought")}</span>}
        <Button disabled={disabled} variant="outline" className="min-h-11" type="button" onClick={() => setAdjusting(item)}>{t("sessions.adjust")}</Button>
      </div>
      <details className="space-y-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">
          {t("sessions.purchaseDetails")}
        </summary>
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            {t("sessions.boughtQuantity")}
            <Input
              key={`quantity:${item.revision}`}
              name="purchasedQuantity"
              type="number"
              min="0.001"
              step="0.001"
              defaultValue={Math.max(item.quantity, item.purchasedQuantity)}
            />
          </label>
          {stocks.length > 0 && (
            <label className="text-sm">
              {t("sessions.stockLocation")}
              <select
                key={`stock:${item.revision}`}
                name="stockItemId"
                className={selectClass}
                defaultValue={
                  item.stockItemId ?? (stocks.length === 1 ? stocks[0]!.id : "")
                }
              >
                <option value="">{t("sessions.chooseLocation")}</option>
                {stocks.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.placeName} · {stock.unit}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled}
            variant="outline"
            type="button"
            onClick={(event) =>
              void onChange({ stockItemId: values(event.currentTarget.form!).stockItemId })
            }
          >
            {t("sessions.saveLocation")}
          </Button>
          <Button
            disabled={disabled}
            variant="ghost"
            type="button"
            onClick={() => void onChange({ remove: true })}
          >
            {t("sessions.remove")}
          </Button>{" "}
        </div>
      </details>
    </form>
      {adjusting && <SessionItemAdjustDialog item={adjusting} products={shopping.products} open onOpenChange={(open) => { if (!open) setAdjusting(null); }} />}
    </>
  );
}
