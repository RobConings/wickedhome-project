import { SessionItemForm } from "../components/session-item-form";
import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { useShoppingSort } from "../data/use-shopping-sort";
import { ShoppingSortField } from "../components/shopping-sort-field";
import { ShoppingNavigation } from "../components/shopping-navigation";
import { formatCurrency } from "@/lib/format";
import { PlusIcon, ShoppingBagIcon, ShoppingCartIcon, SlidersHorizontalIcon, Trash2Icon } from "lucide-react";
import { RecordProgress } from "@/components/shared/record-progress";
import { RecordLink } from "@/components/shared/record-link";
import { SessionExtraDialog } from "../components/session-extra-dialog";
import { ProductFormDialog } from "../components/product-form-dialog";
import { SessionStartCard } from "../components/session-start-card";
import { SessionVisitCard } from "../components/session-visit-card";
import { ShoppingNeedSections } from "../components/shopping-need-sections";
import { ShoppingStockFilterField } from "../components/shopping-stock-filter";
import { visitRequirements } from "../types/shopping-product-rows";
import { sessionDisplayName } from "../types/sessions";
import { SessionPayments } from "../components/session-payments";
import { useLiveEventsStatus } from "@/lib/live-events";
import { useCategoryOrder } from "../data/use-category-order";
import * as React from "react";
import { useNavigate, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { RecordWorkspaceTabs } from "@/components/shared/record-workspace-tabs";
import { Card, CardTitle } from "@/components/shared/card";
import { ShopLogo } from "@/features/shops";
import { useOptionalCurrentUser } from "@/features/auth";
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
import { AutomaticShoppingFilter } from "../components/shopping-preferences";
import {
  groupChecklistItems,
  parseStockFilter,
  matchesStockFilter,
  SHOPPING_STOCK_FILTERS,
  type ShoppingStockFilter,
} from "../components/shopping-grouping";
import {
  attachReceipt,
  addSessionItem,
  closeSession,
  deleteSession,
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
  const { t: tCommon } = useTranslation();
  const user = useOptionalCurrentUser();
  const locale = currentLocale();
  const { order } = useCategoryOrder();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  useLiveRevalidation(live ? 10_000 : null);
  const liveStatus = useLiveEventsStatus();
  const [busy, setBusy] = React.useState(false);
  const [includeLowStock, setIncludeLowStock] = React.useState(true);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [startOpen, setStartOpen] = React.useState(false);

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
  const title = session ? sessionDisplayName(session.name, session.startedAt) : t("sessions.title");
  const sessionShops = session?.shopIds.flatMap((id) => shopping.shops.find((shop) => shop.id === id) ?? []) ?? [];
  const activeSessions = sessions.filter((visit) => visit.status === "active").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const pastSessions = sessions.filter((visit) => visit.status === "closed").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
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
    <PageContainer className="gap-3 px-3 py-4 sm:gap-4 sm:px-6 sm:py-6 lg:px-8">
      {!session && canManage && (
        <Dialog open={startOpen} onOpenChange={setStartOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-visible sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("sessions.simpleStart")}</DialogTitle>
              <DialogDescription>{t("sessions.simpleDescription")}</DialogDescription>
            </DialogHeader>
            <SessionStartCard shopping={shopping} destination={destination} onDestinationChange={setDestination}
              initialSelections={initialSelections} action="/shopping/sessions" compact />
          </DialogContent>
        </Dialog>
      )}
      <PageHeader
        backTo={session ? "/shopping/sessions" : "/shopping"}
        breadcrumbs={[]}
        title={title}
        icon={ShoppingCartIcon}
        description={session ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={active ? "success" : "neutral"}>{t(active ? "sessions.active" : "sessions.closed")}</Badge>
            {sessionShops.slice(0, 3).map((shop) => <ShopLogo key={shop.id} shop={shop} size="sm" />)}
            {sessionShops.length > 3 && <span>+{sessionShops.length - 3}</span>}
            <span>{formatDate(session.startedAt, locale)} · {session.participants.map((part) => part.name).join(", ")}</span>
            <Badge variant={liveStatus === "open" ? "success" : "neutral"}>{t("sessions.live_" + liveStatus)}</Badge>
          </span>
        ) : t("sessions.overviewDescription")}
        actions={!session ? (
          canManage && <Button onClick={() => setStartOpen(true)}><PlusIcon />{t("sessions.startShopping")}</Button>
        ) : active && (
          <PageGrid gap="sm" className="w-full min-w-0 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center xl:justify-end">
            {!session.participants.some((participant) => participant.userId === user?.id) && (
              <Button disabled={busy} variant="outline" onClick={() => void perform(() => joinSession(session.id))}>{t("sessions.join")}</Button>
            )}
            {canManage && <ConfirmDialog
              trigger={<Button disabled={busy} variant="outline">{t("sessions.close")}</Button>}
              title={t("sessions.closeConfirmTitle")}
              description={t("sessions.closeConfirmDescription")}
              confirmLabel={t("sessions.close")}
              cancelLabel={tCommon("actions.cancel")}
              onConfirm={() => perform(() => closeSession(session.id, session.revision))}
            />}
            {canManage && <ConfirmDialog
              trigger={<Button disabled={busy} variant="ghost" className="text-destructive"><Trash2Icon />{t("sessions.delete")}</Button>}
              title={t("sessions.deleteConfirmTitle")}
              description={t("sessions.deleteConfirmDescription")}
              confirmLabel={t("sessions.delete")}
              cancelLabel={tCommon("actions.cancel")}
              destructive
              onConfirm={() => perform(async () => {
                await deleteSession(session.id, session.revision);
                await navigate("/shopping/sessions");
              })}
            />}
          </PageGrid>
        )}
      />
      {!session && <ShoppingNavigation />}
      {session && <RecordProgress compact label={t("sessions.progress")}
        completed={session.items.filter((item) => item.status !== "open").length}
        total={session.items.length}
        summary={t("sessions.progressSummary", {
          bought: session.items.filter((item) => item.status === "bought").length,
          skipped: session.items.filter((item) => item.status === "skipped").length,
        })} />}
      {!session ? (
        <Stack gap="md" className="min-w-0">
          {activeSessions.length > 0 && (
            <section className="space-y-2" aria-labelledby="active-sessions">
              <Inline gap="md" align="baseline" justify="between">
                <h2 id="active-sessions" className="text-lg font-semibold">{t("sessions.activeSessions")}</h2>
                <Badge variant="section">{activeSessions.length}</Badge>
              </Inline>
              <PageGrid gap="3" className="md:grid-cols-2 xl:grid-cols-3">
                {activeSessions.map((visit) => <SessionVisitCard key={visit.id} visit={visit} shops={shopping.shops} />)}
              </PageGrid>
            </section>
          )}
          {pastSessions.length > 0 && (
            <section className="space-y-2" aria-labelledby="past-sessions">
              <h2 id="past-sessions" className="text-lg font-semibold">{t("sessions.pastSessions")}</h2>
              <PageGrid gap="3" className="md:grid-cols-2 xl:grid-cols-3">
                {pastSessions.map((visit) => <SessionVisitCard key={visit.id} visit={visit} shops={shopping.shops} />)}
              </PageGrid>
            </section>
          )}
          {sessions.length === 0 && (
            <Card tone="section" className="p-5">
              <Text weight="medium">{t("sessions.noHistory")}</Text>
              <Text size="sm" tone="muted">{t("sessions.simpleDescription")}</Text>
            </Card>
          )}
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
                <ShoppingSortField value={sort} onChange={changeSort} />
                <AutomaticShoppingFilter
                  included={includeLowStock}
                  onChange={setIncludeLowStock}
                />
                <ShoppingStockFilterField value={stockFilter} onChange={setStockFilter} />
                <Stack gap="md">
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
                </Stack>
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

        </Stack>
      ) : (
        <RecordWorkspaceTabs
          details={
            <Stack gap="3" className="min-w-0">
              <Inline gap="sm" align="center" justify="between" wrap>
                <Text size="sm" weight="semibold">{t("sessions.checklist")} · {session.items.filter((item) => item.status === "open").length}</Text>
                <Inline gap="sm" align="center" wrap>
                  {(active || (canManage && session.purchases.some((purchase) => purchase.receipts.length > 0))) && (
                    <SessionExtraDialog products={shopping.products} disabled={busy} />
                  )}
                  {canManage && active && (
                    <ProductFormDialog
                      shops={shopping.shops}
                      products={shopping.products}
                      onSaved={(productId) => {
                        void perform(() => addSessionItem(session.id, { productId, quantity: 1 }));
                      }}
                      trigger={<Button variant="outline" size="sm" disabled={busy}><PlusIcon />{t("sessions.createProduct")}</Button>}
                    />
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" aria-label={t("shopView.filters.viewOptions")}>
                        <SlidersHorizontalIcon />{t("shopView.filters.viewOptions")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="max-h-[75dvh] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-y-auto">
                      <Stack gap="xs">
                        <label className="text-sm font-medium">{t("shopView.sort.label")}</label>
                        <ShoppingSortField value={sort} onChange={changeSort} />
                      </Stack>
                      <Stack gap="xs">
                        <label className="text-sm font-medium">{t("stockFilter.label")}</label>
                        <Select value={stockFilter} onValueChange={(value) => setStockFilter(value as ShoppingStockFilter)}>
                          <SelectTrigger className="w-full" aria-label={t("stockFilter.label")}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SHOPPING_STOCK_FILTERS.map((option) => <SelectItem key={option} value={option}>{t("stockFilter." + option)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Stack>
                    </PopoverContent>
                  </Popover>
                </Inline>
              </Inline>
              {active && <Text size="xs" tone="muted" className="px-1">{t("sessions.optionalSuggestions")}</Text>}
              {!active && (
                <Card tone="section" className="gap-1 p-3">
                  <CardTitle>{t("sessions.finishedTitle")}</CardTitle>
                  <Text size="sm" tone="muted">{t("sessions.finishedHint")}</Text>
                </Card>
              )}
              {groupChecklistItems(session.items.filter((item) => item.status === "open" && matchesStockFilter(item, stockFilter)), sort, order, locale).map((group) => (
                <section key={group.key} className="space-y-1">
                  {sort === "category" && (
                    <h3 className="px-1 text-sm font-semibold">{t("categories." + group.key)}</h3>
                  )}
                  <Card className="gap-0 overflow-hidden p-0">
                    <ShoppingNeedSections grouped={sort === "category"} items={group.items}>
                      {(items) => items.map(renderItem)}
                    </ShoppingNeedSections>
                  </Card>
                </section>
              ))}
              {session.items.every((item) => item.status !== "open") && (
                <Text size="sm" tone="muted" className="rounded-xl border border-dashed p-4">{t("sessions.noOpenItems")}</Text>
              )}
              {session.items.some((item) => item.status === "open") &&
                !session.items.some((item) => item.status === "open" && matchesStockFilter(item, stockFilter)) && (
                  <Text size="sm" tone="muted" className="rounded-xl border border-dashed p-4">{t("shopView.filters.noResults")}</Text>
                )}
              {(["bought", "skipped"] as const).map((status) => {
                const items = session.items.filter((item) => item.status === status);
                return items.length > 0 && (
                  <details key={status} data-item-status={status} className="rounded-xl border bg-card p-3">
                    <summary className="min-h-10 cursor-pointer py-2 font-medium">{t("sessions.item_" + status)} ({items.length})</summary>
                    <Stack gap="none" className="divide-y border-t">
                      {items.slice().sort((a, b) => a.name.localeCompare(b.name, locale)).map(renderItem)}
                    </Stack>
                  </details>
                );
              })}
            </Stack>
          }
          overview={
            <Stack gap="3" className="min-w-0">
              {!session.purchases.length && (
                <Card className="p-4">
                  <Text weight="medium">{t("sessions.noPurchases")}</Text>
                  <Text size="sm" tone="muted">{t("sessions.stockHint")}</Text>
                </Card>
              )}
          {session.purchases.map((purchase) => (
            <Card key={purchase.id} className="space-y-4">
              <Inline gap="sm" align="center" justify="between" wrap><CardTitle>{t("sessions.purchase")}</CardTitle><Button asChild variant="outline"><RecordLink to={`/purchases/${purchase.id}`}><ShoppingBagIcon />{t("sessions.openPurchase")}</RecordLink></Button></Inline>
              <Text size="sm" tone="muted">
                {t("sessions.stockHint")}
              </Text>
              {purchase.lines.map((line) => (
                <Text size="sm"  key={line.id}>
                  {line.name} · {line.purchasedQuantity ?? line.quantity} {line.purchasedQuantity != null ? line.purchasedUnit : line.unit} ·{" "}
                  {t(
                    line.stockAdded
                      ? "sessions.stockCredited"
                      : "sessions.untracked",
                  )}
                </Text>
              ))}
              {purchase.receipts.map((receipt) => (
                <Stack gap="3"
                  className="rounded-lg border p-3"
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
                  <Text size="sm">
                    {
                      shopping.shops.find((shop) => shop.id === receipt.shopId)
                        ?.name
                    }{" "}
                    · {formatDate(receipt.purchasedAt, locale)}
                    {receipt.totalCents !== null
                      ? ` · ${formatCurrency(receipt.totalCents, locale)}`
                      : ""}
                  </Text>
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
                                {line.name} · {line.purchasedQuantity ?? line.quantity} {line.purchasedQuantity != null ? line.purchasedUnit : line.unit}
                              </option>
                            ))}
                            {session.availableAcquisitions.length > 0 && (
                              <optgroup label={t("sessions.priorAcquisitions")}>
                                {session.availableAcquisitions.map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.name} · {line.quantity} {line.unit} · {formatDate(line.purchasedAt, locale)}
                                  </option>
                                ))}
                              </optgroup>
                            )}
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
                </Stack>
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
            </Stack>
          }
          detailsLabel={t("sessions.checklist")}
          overviewLabel={t("sessions.purchasesTab")}
          label={t("sessions.workspaceNavigation")}
        />
      )}
    </PageContainer>
  );
}
