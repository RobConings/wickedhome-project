import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useNow } from "@/lib/use-now";
import { PageSection } from "@/components/layout/page-section";
import { PageGrid } from "@/components/layout/page-grid";
import { Text } from "@/components/ui/text";
import { Card, CardHeader, CardHeading } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { Shop } from "@/features/shops";
import { useCollectAndGo, type CollectAndGoInitial } from "../data/use-collect-and-go";
import type { CollectAndGoOrderDetail } from "../types/collect-and-go";
import { upcomingCollectAndGoOrders } from "../types/collect-and-go-activity";
import { CollectAndGoReservation } from "./collect-and-go-panel";
import { SessionVisitCard } from "./session-visit-card";

/** Live retailer sessions retain retailer account grants; never copy them into household-wide visit rows. */
export function CollectAndGoSessions({ shops, initial, initialOrder }: { shops: Shop[]; initial?: CollectAndGoInitial; initialOrder?: CollectAndGoOrderDetail }) {
  const { t, i18n } = useTranslation("shopping");
  const { data, loading } = useCollectAndGo({ initial });
  const [params] = useSearchParams();
  const now = useNow(30000);
  const requested = params.get("retailer") === "collectandgo" ? params.get("order") : null;
  const selected = data?.orders?.orders.find(order => order.id === requested);
  if (!data?.status.connected || !data.status.canUse || data.status.needsReconnect) return requested ? <InlineAlert tone="warning">{t(data?.status.needsReconnect ? "collectAndGoList.errors.reconnect" : "collectAndGoList.noAccess")}</InlineAlert> : null;
  const upcoming = upcomingCollectAndGoOrders(data.orders?.orders ?? [], now);
  if (!upcoming.length && !requested && !data.ordersError && !data.reservationsIncomplete) return null;
  return <PageSection aria-label={t("onlineVisits.title")}>
    <h2 className="text-lg font-semibold">{t("onlineVisits.title")}</h2>
    {data.ordersError && <InlineAlert tone="warning">{t(`collectAndGoList.errors.${data.ordersError}`)} {t("collectAndGoList.stale")}</InlineAlert>}
    {data.reservationsIncomplete && <InlineAlert tone="warning">{t("onlineVisits.partial")}</InlineAlert>}
    {requested ? <>
      <Link className="inline-flex min-h-10 items-center self-start text-sm underline" to="/shopping/sessions">{t("onlineVisits.allSessions")}</Link>
      {selected ? <Card>
        <CardHeader><CardHeading title={t("onlineVisits.orderTitle", { id: selected.id })} description={t("onlineVisits.linked")} /></CardHeader>
        <CollectAndGoReservation id={selected.id} initial={data.reservations?.find(order => order.id === selected.id) ?? initialOrder} refreshAt={data.orders?.observedAt} />
        <Text size="xs" tone="muted">{t("onlineVisits.noPurchase")}</Text>
      </Card> : !loading && <InlineAlert tone="warning">{t("onlineVisits.notFound")}</InlineAlert>}
    </> : <>
      <Text size="sm" tone="muted">{t("onlineVisits.linked")}</Text>
      <PageGrid gap="3" className="md:grid-cols-2 xl:grid-cols-3">{upcoming.map(order => <SessionVisitCard key={order.id}
        visit={{ id: `collectandgo:${order.id}`, name: t("onlineVisits.orderTitle", { id: order.id }), status: "active", startedAt: order.pickupFrom ?? data.orders!.observedAt, closedAt: null, revision: 0, shopIds: shops.filter(shop => /collect\s*&\s*go/i.test(shop.name)).map(shop => shop.id) }} shops={shops}
        to={`/shopping/sessions?retailer=collectandgo&order=${encodeURIComponent(order.id)}`} statusLabel={t("onlineVisits.reserved")} actionLabel={t("onlineVisits.open")}
        metadata={`${order.pickupFrom ? new Date(order.pickupFrom).toLocaleString(i18n.language, { timeZone: "Europe/Brussels" }) : t("collectAndGoList.unknown")} · ${order.pickupPoint ?? "Collect&Go"}`} />)}</PageGrid>
    </>}
  </PageSection>;
}
