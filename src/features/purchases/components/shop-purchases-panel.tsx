import { ReceiptTextIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { useAsyncResource } from "@/lib/use-async-resource";
import { formatDate } from "@/types/date-format";
import { fetchPurchases } from "../data/purchases-requests";
import { purchasePath, type PurchaseSummary } from "../types/purchases";

/** A preview of existing purchases, with money redacted by the owner service for children. */
export function ShopPurchasesPanel({ shopId, initialData }: { shopId: string; initialData?: PurchaseSummary[] }) {
  const { t } = useTranslation("purchases");
  const { t: common } = useTranslation();
  const locale = currentLocale();
  const { data, error, loading, refresh } = useAsyncResource(`shop-purchases:${shopId}`, () => fetchPurchases({ shopId }), { initial: initialData });
  return <Card>
    <div><CardTitle>{t("shop.title")}</CardTitle><CardDescription>{t("shop.description")}</CardDescription></div>
    {loading && <Skeleton className="h-24 rounded-xl" aria-label={t("shop.loading")} />}
    {error && <div role="status" className="flex flex-col items-start gap-2 text-sm"><p>{common("errors.generic")}</p><Button variant="outline" size="sm" onClick={refresh}>{common("actions.retry")}</Button></div>}
    {data && (data.length ? <ul className="divide-y">{data.slice(0, 5).map((purchase) => <li key={`${purchase.kind}:${purchase.id}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <IconChip icon={ReceiptTextIcon} tone="finance" />
      <div className="min-w-0 flex-1 space-y-1">
        <RecordLink to={purchasePath(purchase)} className="font-medium break-words text-primary hover:underline">{purchase.name ?? t("unnamed")}</RecordLink>
        <p className="text-sm text-muted-foreground">{formatDate(purchase.purchasedAt, locale)}</p>
        <p className="text-xs text-muted-foreground">{t("lines", { count: purchase.lineCount })} · {t("receipts", { count: purchase.receiptCount })}</p>
        {purchase.canReadMoney && <p className="text-sm tabular-nums">{purchase.totalCents === null ? t("unknownAmount") : formatCurrency(purchase.totalCents, locale)}</p>}
      </div>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">{t("shop.empty")}</p>)}
    <Button asChild variant="outline" size="sm" fullOnMobile><RecordLink to={`/purchases?shopId=${encodeURIComponent(shopId)}`}>{t("shop.open")}</RecordLink></Button>
  </Card>;
}
