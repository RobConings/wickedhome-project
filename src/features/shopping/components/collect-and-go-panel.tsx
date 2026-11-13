import { upcomingCollectAndGoOrders } from "../types/collect-and-go-activity";
import { useNow } from "@/lib/use-now";
import { useAsyncResource } from "@/lib/use-async-resource";
import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardHeading } from "@/components/shared/card";
import { DescriptionList, DescriptionItem } from "@/components/shared/description-list";
import { GeneralList } from "@/components/shared/general-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { collectAndGoClient } from "../data/collect-and-go-requests";
import { collectAndGoReadError, type CollectAndGoLive } from "../data/use-collect-and-go";
import type { CollectAndGoCart, CollectAndGoOrderDetail } from "../types/collect-and-go";

function Products({ cart, loading, empty }: { cart?: Pick<CollectAndGoCart, "items" | "truncated">; loading: boolean; empty: string }) {
  const { t, i18n } = useTranslation("shopping");
  const money = (cents: number) => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR" }).format(cents / 100);
  return <>
    {cart?.truncated && <InlineAlert tone="warning">{t("collectAndGoList.partial")}</InlineAlert>}
    <GeneralList variant="embedded" label={t("collectAndGoList.products")} items={cart?.items ?? []} getKey={(item) => String(cart?.items.indexOf(item))} loading={loading && !cart} emptyState={cart && !cart.truncated ? <Text size="sm" tone="muted">{empty}</Text> : null}
      renderRow={(item) => <Inline gap="sm" align="start" className="w-full">
        <Stack gap="xs" className="min-w-0 flex-1"><Text size="sm" className="break-words">{item.name}</Text><Text size="xs" tone="muted">{t("collectAndGoList.quantity", { count: item.quantity, quantity: new Intl.NumberFormat(i18n.language).format(item.quantity) })}</Text></Stack>
        <Text size="sm" tone="muted" className="shrink-0 tabular-nums">{item.unitPriceCents === null ? t("collectAndGoList.unknownPrice") : t("collectAndGoList.unitPrice", { price: money(item.unitPriceCents) })}</Text>
      </Inline>} />
  </>;
}
export function CollectAndGoReservation({ id, initial, refreshAt }: { id: string; initial?: CollectAndGoOrderDetail; refreshAt?: string }) {
  const { t, i18n } = useTranslation("shopping");
  const now = useNow(1000);
  const seed = React.useMemo(() => initial?.id === id ? { value: initial, error: null } : undefined, [initial, id]);
  const resource = useAsyncResource<{ value: CollectAndGoOrderDetail | null; error: string | null }>(`${id}:${refreshAt ?? ""}`, async () => {
    try { return { value: await collectAndGoClient.order(id), error: null }; }
    catch (cause) { return { value: null, error: collectAndGoReadError(cause) }; }
  }, { initial: seed });
  const data = resource.data?.value, error = resource.data?.error ?? (resource.error ? "unavailable" : null), loading = resource.loading;
  const date = (value: string | null) => value ? new Date(value).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) : t("collectAndGoList.unknown");
  return <Stack gap="md">
    {error && <InlineAlert tone="warning">{t(`collectAndGoList.errors.${error}`)}</InlineAlert>}
    {data && <>
      <DescriptionList>
        <DescriptionItem label={t("collectAndGoList.pickup")}>{data.pickupPoint ?? t("collectAndGoList.unknown")}<Text size="sm">{date(data.pickupFrom)} – {date(data.pickupUntil)}</Text></DescriptionItem>
        <DescriptionItem label={t("collectAndGoList.amendUntil")}>{date(data.amendableUntil)}<Text size="xs" tone="muted">{t("collectAndGoList.belgianTime")}</Text></DescriptionItem>
        <DescriptionItem label={t("collectAndGoList.estimatedTotal")}>{data.estimatedTotalCents === null ? t("collectAndGoList.unknown") : new Intl.NumberFormat(i18n.language, { style: "currency", currency: "EUR" }).format(data.estimatedTotalCents / 100)}</DescriptionItem>
        <DescriptionItem label={t("collectAndGoList.editStatus")}><Badge variant="outline">{t(`collectAndGoList.editStates.${data.editState === "open" && data.amendableUntil && Date.parse(data.amendableUntil) <= now ? "closed" : data.editState}`)}</Badge></DescriptionItem>
      </DescriptionList>
      <Text size="xs" tone="muted">{t("collectAndGoList.checked", { date: date(data.observedAt) })}</Text>
      <a className="inline-flex min-h-10 items-center self-start text-sm underline" href={data.url} target="_blank" rel="noopener noreferrer">{t("collectAndGoList.openOrder")}</a>
    </>}
    <Products cart={data ?? undefined} loading={loading} empty={t("collectAndGoList.emptyOrder")} />
  </Stack>;
}
export function CollectAndGoPanel({ live, initialOrder }: { live: CollectAndGoLive; initialOrder?: CollectAndGoOrderDetail }) {
  const { t, i18n } = useTranslation("shopping");
  const { data, loading, refresh } = live;
  const now = useNow(30000);
  const [selection, setSelection] = React.useState("");
  const status = data?.status;
  const orders = data?.orders?.orders ?? [];
  const upcoming = upcomingCollectAndGoOrders(orders, now);
  const selected = orders.find(order => order.id === selection) ?? upcoming[0] ?? orders[0];
  return <PageSection aria-label={t("collectAndGoList.title")}>
    <Inline gap="sm" align="center" wrap className="justify-between">
      <Text size="sm" tone="muted">{t("collectAndGoList.description")}</Text>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void refresh()}><RefreshCwIcon aria-hidden="true" className={loading ? "animate-spin" : ""} />{t("collectAndGoList.refresh")}</Button>
    </Inline>
    {!loading && !data?.cartError && (!status?.connected || !status.canUse) && <Text size="sm" tone="muted">{t(status?.connected ? "collectAndGoList.noAccess" : "collectAndGoList.notConnected")}</Text>}
    {data?.cartError && !status?.connected && <InlineAlert tone="warning">{t(`collectAndGoList.errors.${data.cartError}`)}</InlineAlert>}
    {status?.needsReconnect && <InlineAlert tone="warning">{t("collectAndGoList.errors.reconnect")}</InlineAlert>}
    {((status?.connected && status.canUse && !status.needsReconnect) || loading) && <PageGrid className="lg:grid-cols-2">
      <Card role="region" aria-label={t("collectAndGoList.basket")}>
        <CardHeader><CardHeading title={t("collectAndGoList.basket")} description={t("collectAndGoList.basketDescription")} /></CardHeader>
        {data?.cartError && <InlineAlert tone="warning">{t(`collectAndGoList.errors.${data.cartError}`)}{data.cart && ` ${t("collectAndGoList.stale")}`}</InlineAlert>}
        {data?.cart && <Text size="xs" tone="muted">{t("collectAndGoList.checked", { date: new Date(data.cart.observedAt).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) })}</Text>}
        <Products cart={data?.cart} loading={loading} empty={t("collectAndGoList.emptyBasket")} />
      </Card>
      <Card role="region" aria-label={t("collectAndGoList.orders")}>
        <CardHeader><CardHeading title={t("collectAndGoList.orders")} description={t("collectAndGoList.ordersDescription")} /></CardHeader>
        {data?.ordersError && <InlineAlert tone="warning">{t(`collectAndGoList.errors.${data.ordersError}`)}{data.orders && ` ${t("collectAndGoList.stale")}`}</InlineAlert>}
        {data?.orders?.truncated && <InlineAlert tone="warning">{t("collectAndGoList.partial")}</InlineAlert>}
        {orders.length > 0 && <Select value={selected?.id ?? ""} onValueChange={setSelection}><SelectTrigger className="w-full" aria-label={t("collectAndGoList.chooseOrder")}><SelectValue /></SelectTrigger><SelectContent>{orders.map(order => <SelectItem key={order.id} value={order.id}>{t("collectAndGoList.order", { id: order.id })} · {order.pickupFrom ? new Date(order.pickupFrom).toLocaleDateString(i18n.language, { timeZone: "Europe/Brussels" }) : t("collectAndGoList.unknown")}</SelectItem>)}</SelectContent></Select>}
        {selected && <CollectAndGoReservation key={selected.id} id={selected.id} initial={data?.reservations?.find(order => order.id === selected.id) ?? initialOrder} refreshAt={data?.orders?.observedAt} />}
        {!selected && data?.orders && !data.orders.truncated && !data.ordersError && <Text size="sm" tone="muted">{t("collectAndGoList.emptyOrders")}</Text>}
        {!data?.orders && loading && <Text size="sm" role="status">{t("collectAndGoList.loading")}</Text>}
      </Card>
    </PageGrid>}
    {data?.reservationsIncomplete && <InlineAlert tone="warning">{t("onlineVisits.partial")}</InlineAlert>}
    <Link className="inline-flex min-h-10 items-center self-start text-sm underline" to="/shopping/sessions">{t("onlineVisits.allSessions")}</Link>
    <Link className="inline-flex min-h-10 items-center self-start text-sm underline" to="/settings?section=collectandgo">{t("collectAndGoList.settings")}</Link>
    <Text size="xs" tone="muted">{t("collectAndGoList.readOnly")}</Text>
  </PageSection>;
}
