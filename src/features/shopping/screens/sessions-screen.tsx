import { useLiveEventsStatus } from "@/lib/live-events";
import { useCategoryOrder } from "../data/use-category-order";
import * as React from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
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
import { todayIn } from "@/types/dates";
import type { ShoppingPageData } from "../data/shopping-loaders";
import type { SessionItem, SessionSummary, SessionView } from "../types/sessions";
import { AutomaticShoppingFilter, CategoryOrder } from "../components/shopping-preferences";
import { groupItemsByCategory } from "../components/shopping-grouping";
import { addSessionItem, attachReceipt, closeSession, joinSession, planShoppingVisit, reconcileReceipt, startShoppingSession, updateSessionItem } from "../data/sessions-requests";
import { useLiveRevalidation } from "../data/use-live-shopping";

type Props = { shopping: ShoppingPageData; sessions: SessionSummary[]; session: SessionView | null; canManage: boolean };
const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 text-sm";
const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

export function SessionsScreen({ shopping, sessions, session, canManage }: Props) {
  const { t } = useTranslation("shopping");
  const locale = currentLocale();
  const { order, change } = useCategoryOrder();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  useLiveRevalidation();
  const liveStatus = useLiveEventsStatus();
  const [busy, setBusy] = React.useState(false);
  const [includeLowStock, setIncludeLowStock] = React.useState(true);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [shopIds, setShopIds] = React.useState<string[]>([]);
  const [groupId, setGroupId] = React.useState("");
  const perform = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("errors.generic")); }
    finally { await revalidator.revalidate(); setBusy(false); }
  };
  const open = shopping.overview.items.filter((item) => item.status === "open" && (includeLowStock || (item.requirements ?? [item]).some((part) => part.source !== "low_stock")));
  const active = session?.status === "active";
  const title = session?.name ?? t("sessions.title");
  return <PageContainer>
    <PageHeader title={title} description={session ? `${formatDate(session.startedAt, locale)} · ${session.participants.map((part) => part.name).join(", ")}` : t("sessions.description")} />
    <div className="flex flex-wrap gap-3 text-sm"><Link to="/shopping" className="underline">{t("actions.backToShopping")}</Link>{session && <Link to="/shopping/sessions" className="underline">{t("sessions.history")}</Link>}</div>
    <p role="status" className="text-xs text-muted-foreground">{t(`sessions.live_${liveStatus}`)}</p>
    {!session ? <>
      {canManage && <Card className="space-y-4"><CardTitle>{t("sessions.plan")}</CardTitle>
        <Button disabled={busy} variant="outline" onClick={() => void perform(planShoppingVisit)}>{t("sessions.refreshNeeds")}</Button>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault(); const form = event.currentTarget;
          void perform(async () => { const result = await startShoppingSession({ name: field(form, "name"), shopIds, shopGroupId: groupId || undefined, requirementIds: selected.filter((id) => open.some((item) => item.id === id)), includeLowStock }); await navigate(`/shopping/sessions/${result.id}`); });
        }}>
          <label className="block text-sm">{t("fields.name")}<Input name="name" required maxLength={100} defaultValue={`${t("sessions.visit")} ${formatDate(todayIn(), locale)}`} /></label>
          <label className="block text-sm">{t("sessions.shopGroup")}<select className={selectClass} value={groupId} onChange={(event) => { setGroupId(event.target.value); setShopIds(shopping.shopGroups?.find((group) => group.id === event.target.value)?.shopIds ?? []); }}><option value="">{t("sessions.chooseShops")}</option>{shopping.shopGroups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <fieldset><legend className="text-sm font-medium">{t("sessions.chooseShops")}</legend><div className="grid gap-2 sm:grid-cols-3">{shopping.shops.map((shop) => <label key={shop.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shopIds.includes(shop.id)} onChange={(event) => { setGroupId(""); setShopIds((ids) => event.target.checked ? [...ids, shop.id] : ids.filter((id) => id !== shop.id)); }} />{shop.name}</label>)}</div></fieldset>
          <AutomaticShoppingFilter included={includeLowStock} onChange={setIncludeLowStock} />
          <CategoryOrder order={order} onChange={change} />
          <div className="space-y-4">{groupItemsByCategory(open, order).map((group) => <fieldset key={group.category}><legend className="font-medium">{t(`categories.${group.category}`)}</legend>{group.items.map((item) => <label key={item.id} className="flex min-h-12 items-center gap-3 border-b text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} /><span>{item.name} <span className="text-muted-foreground">{item.quantity} {item.unit} · {[...new Set((item.requirements ?? [item]).map((part) => t(`sources.${part.source}`)))].join(", ")}</span></span></label>)}</fieldset>)}</div>
          <Button disabled={busy} type="submit">{t("sessions.start", { count: selected.filter((id) => open.some((item) => item.id === id)).length })}</Button>
        </form>
      </Card>}
      <Card className="space-y-3"><CardTitle>{t("sessions.history")}</CardTitle>{sessions.map((visit) => <Link className="flex min-h-12 items-center justify-between gap-2 border-b text-sm" key={visit.id} to={`/shopping/sessions/${visit.id}`}><span>{visit.name} · {formatDate(visit.startedAt, locale)}</span><span>{t(`sessions.${visit.status}`)}</span></Link>)}{!sessions.length && <p>{t("sessions.noHistory")}</p>}</Card>
    </> : <>
      <div className="flex flex-wrap gap-2"><span className="rounded-full border px-3 py-2 text-sm">{t(`sessions.${session.status}`)}</span>{active && <Button disabled={busy} variant="outline" onClick={() => void perform(() => joinSession(session.id))}>{t("sessions.join")}</Button>}{active && canManage && <Button disabled={busy} onClick={() => void perform(() => closeSession(session.id, session.revision))}>{t("sessions.close")}</Button>}</div>
      <CategoryOrder order={order} onChange={change} />
      {order.filter((category) => session.items.some((item) => item.category === category)).map((category) => <Card className="space-y-3" key={category}><CardTitle>{t(`categories.${category}`)}</CardTitle>{session.items.filter((item) => item.category === category).sort((a, b) => a.name.localeCompare(b.name, "nl")).map((item) => <SessionItemForm key={`${item.id}:${item.revision}`} item={item} session={session} shopping={shopping} disabled={busy || !active} onChange={(input) => perform(() => updateSessionItem(session.id, item.id, { ...input, revision: item.revision, operationId: crypto.randomUUID() }))} />)}</Card>)}
      {(active || canManage && session.purchases.some((purchase) => purchase.receipts.length > 0)) && <Card><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void perform(() => addSessionItem(session.id, { productId: field(form, "productId") || undefined, name: field(form, "name") || undefined, quantity: Number(field(form, "quantity")) })); }}><label className="min-w-48 flex-1 text-sm">{t("sessions.product")}<select name="productId" className={selectClass}><option value="">{t("sessions.oneOff")}</option>{shopping.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="text-sm">{t("fields.name")}<Input name="name" /></label><label className="w-28 text-sm">{t("fields.quantity")}<Input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label><Button disabled={busy}>{t("sessions.add")}</Button></form></Card>}
      {session.purchases.map((purchase) => <Card key={purchase.id} className="space-y-4"><CardTitle>{t("sessions.purchase")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("sessions.stockHint")}</p>
        {purchase.lines.map((line) => <p className="text-sm" key={line.id}>{session.items.find((item) => item.id === line.sessionItemId)?.name ?? t("sessions.product")} · {line.quantity} {line.unit} · {t(line.stockAdded ? "sessions.stockCredited" : "sessions.untracked")}</p>)}
        {purchase.receipts.map((receipt) => <div className="space-y-3 rounded-lg border p-3" key={receipt.id}><a className="text-sm underline" href={receipt.documentId ? `/api/documents/files/${receipt.documentId}/content` : "/documents"} target="_blank" rel="noreferrer">{receipt.filename}</a><p className="text-sm">{formatDate(receipt.purchasedAt, locale)}{receipt.totalCents !== null ? ` · € ${(receipt.totalCents / 100).toFixed(2)}` : ""}</p>
          {canManage && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void perform(() => reconcileReceipt(session.id, receipt.id, { sessionItemId: field(form, "itemId"), reference: field(form, "reference"), quantity: Number(field(form, "quantity")), acceptDifference: new FormData(form).has("acceptDifference"), existingPurchaseIds: new FormData(form).getAll("purchaseIds").length ? new FormData(form).getAll("purchaseIds").map(String) : undefined, countDisposition: (field(form, "countDisposition") || undefined) as "already_counted" | "add_after_count" | undefined })); }}><label className="text-sm">{t("sessions.matchProduct")}<select name="itemId" className={selectClass} required>{session.items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.purchasedQuantity}/{item.quantity})</option>)}</select></label><label className="text-sm">{t("sessions.matchAcquisitions")}<select name="purchaseIds" multiple className={selectClass}>{purchase.lines.map((line) => <option key={line.id} value={line.id}>{session.items.find((item) => item.id === line.sessionItemId)?.name} · {line.quantity} {line.unit}</option>)}</select></label><label className="text-sm">{t("sessions.countDisposition")}<select name="countDisposition" className={selectClass}><option value="">{t("sessions.countUnknown")}</option><option value="already_counted">{t("sessions.alreadyCounted")}</option><option value="add_after_count">{t("sessions.addAfterCount")}</option></select></label><label className="text-sm">{t("sessions.receiptLine")}<Input name="reference" required maxLength={100} /></label><label className="text-sm">{t("sessions.receiptQuantity")}<Input name="quantity" required type="number" min="0.001" step="0.001" /></label><label className="flex items-center gap-2 text-sm"><input name="acceptDifference" type="checkbox" />{t("sessions.acceptDifference")}</label><Button disabled={busy}>{t("sessions.match")}</Button></form>}
        </div>)}
        {canManage && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const file = new FormData(form).get("receipt"); if (!(file instanceof File) || !file.size) return; const date = field(form, "date"); const total = field(form, "total"); void perform(async () => { const document = await uploadDocument(file); return attachReceipt(session.id, { documentId: document.id, shopId: field(form, "shopId") || undefined, purchasedAt: `${date}T12:00:00.000Z`, totalCents: total ? Math.round(Number(total) * 100) : undefined }); }); }}><label className="text-sm">{t("fields.shop")}<select name="shopId" className={selectClass} defaultValue={purchase.shopId ?? ""} required><option value="">{t("sessions.chooseShops")}</option>{shopping.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label className="text-sm">{t("sessions.receipt")}<Input name="receipt" type="file" accept="image/*,application/pdf" required /></label><label className="text-sm">{t("sessions.receiptDate")}<Input name="date" type="date" defaultValue={session.startedAt.slice(0, 10)} required /></label><label className="text-sm">{t("sessions.total")}<Input name="total" type="number" step="0.01" min="0" /></label><Button disabled={busy}>{t("sessions.attachReceipt")}</Button></form>}
      </Card>)}
    </>}
  </PageContainer>;
}

function SessionItemForm({ item, session, shopping, disabled, onChange }: { item: SessionItem; session: SessionView; shopping: ShoppingPageData; disabled: boolean; onChange: (input: Omit<Parameters<typeof updateSessionItem>[2], "revision" | "operationId">) => Promise<void> }) {
  const { t } = useTranslation("shopping");
  const product = shopping.products.find((product) => product.id === item.productId);
  const stocks = session.stockOptions.filter((stock) => stock.productId === (product?.stockProductId ?? item.productId));
  const values = (form: HTMLFormElement) => ({ quantity: Number(field(form, "quantity")), stockItemId: field(form, "stockItemId") || undefined });
  return <form className="space-y-3 rounded-xl border p-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void onChange({ ...values(form), status: "bought", purchasedQuantity: Number(field(form, "purchasedQuantity")) }); }}>
    <p className="font-medium">{item.name} <span className="ml-2 text-xs text-muted-foreground">{t(`sessions.item_${item.status}`)} · {item.purchasedQuantity}/{item.quantity} {item.unit}</span></p>
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3"><label className="text-sm">{t("sessions.plannedQuantity")}<Input name="quantity" type="number" min="0.001" step="0.001" defaultValue={item.quantity} /></label><label className="text-sm">{t("sessions.boughtQuantity")}<Input name="purchasedQuantity" type="number" min="0.001" step="0.001" defaultValue={Math.max(item.quantity, item.purchasedQuantity)} /></label>{stocks.length > 0 && <label className="text-sm">{t("sessions.stockLocation")}<select name="stockItemId" className={selectClass} defaultValue={item.stockItemId ?? (stocks.length === 1 ? stocks[0]!.id : "")}><option value="">{t("sessions.chooseLocation")}</option>{stocks.map((stock) => <option key={stock.id} value={stock.id}>{stock.placeName} · {stock.unit}</option>)}</select></label>}</fieldset>
    <div className="flex flex-wrap gap-2"><Button disabled={disabled} type="submit">{t("sessions.buy")}</Button><Button disabled={disabled} variant="outline" type="button" onClick={(event) => void onChange(values(event.currentTarget.form!))}>{t("sessions.saveQuantity")}</Button><Button disabled={disabled} variant="outline" type="button" onClick={() => void onChange({ status: item.status === "skipped" ? "open" : "skipped" })}>{t(item.status === "skipped" ? "planning.restore" : "planning.skip")}</Button><Button disabled={disabled} variant="ghost" type="button" onClick={() => void onChange({ remove: true })}>{t("sessions.remove")}</Button></div>
  </form>;
}
