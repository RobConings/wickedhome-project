import { ReceiptTextIcon, ShoppingBagIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/shared/card";
import { GeneralList } from "@/components/shared/general-list";
import { PageHeader } from "@/components/shared/page-header";
import { IconChip } from "@/components/shared/icon-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import { purchasePath, type PurchaseSummary } from "../types/purchases";

export function PurchasesScreen({ purchases, filtered = false }: { purchases: PurchaseSummary[]; filtered?: boolean }) {
  const { t } = useTranslation("purchases");
  const locale = currentLocale();
  const content = (purchase: PurchaseSummary) => <>
    <IconChip icon={ReceiptTextIcon} tone="finance" />
    <div className="min-w-0 flex-1"><Link to={purchasePath(purchase)} className="font-medium break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">{purchase.name ?? t("unnamed")}</Link>
      <p className="text-sm text-muted-foreground">{formatDate(purchase.purchasedAt, locale)}{purchase.shopName ? ` · ${purchase.shopName}` : ""}</p>
      <p className="text-xs text-muted-foreground">{t("lines", { count: purchase.lineCount })} · {t("receipts", { count: purchase.receiptCount })}</p>
    </div>
    {purchase.canReadMoney && <span className="shrink-0 text-sm tabular-nums">{purchase.totalCents === null ? t("unknownAmount") : formatCurrency(purchase.totalCents, locale)}</span>}
  </>;
  return <PageContainer><PageHeader title={t(filtered ? "filteredTitle" : "title")} description={t("description")}
    actions={<Button asChild><Link to="/shopping/sessions"><ShoppingBagIcon />{t("startTrip")}</Link></Button>} />
    <GeneralList label={t("title")} items={purchases} getKey={(purchase) => `${purchase.kind}:${purchase.id}`}
      renderRow={(purchase) => <div className="relative flex min-w-0 items-center gap-3">{content(purchase)}</div>}
      renderTile={(purchase) => <Card className="relative flex-row items-center gap-3">{content(purchase)}</Card>}
      storageKey="purchases" viewParam="view" search={{ param: "q", keys: (purchase) => [purchase.name, purchase.shopName], label: t("search"), placeholder: t("search") }}
      emptyState={<EmptyState icon={ReceiptTextIcon} title={t("empty")} description={t("emptyDescription")} />} />
  </PageContainer>;
}
