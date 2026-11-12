import { GeneralList } from "@/components/shared/general-list";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import { GoodsAllocationDialog } from "../components/goods-allocation-dialog";
import type { ReactNode } from "react";
import { DownloadIcon, FolderIcon, PackageIcon, ReceiptIcon, ShoppingBagIcon, StoreIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardTitle } from "@/components/shared/card";
import { RelatedRecordCards, type RelatedRecordLink } from "@/components/shared/related-record-cards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { documentContentUrl } from "@/features/documents";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatDate } from "@/types/date-format";
import type { PurchaseDetail } from "../types/purchases";

export function PurchaseDetailScreen({ purchase, payments, canAllocate = false }: { purchase: PurchaseDetail; payments?: ReactNode; canAllocate?: boolean }) {
  const { t } = useTranslation("purchases");
  const locale = currentLocale();
  return <PageContainer><PageHeader title={purchase.name ?? t("unnamed")} description={`${formatDate(purchase.purchasedAt, locale)}${purchase.shopName ? ` · ${purchase.shopName}` : ""}`}
    backTo="/purchases"
    breadcrumbs={[{ label: t("title"), to: "/purchases" }, { label: purchase.name ?? t("unnamed") }]}
    actions={purchase.sessionId && <Button asChild variant="outline"><Link to={`/shopping/sessions/${encodeURIComponent(purchase.sessionId)}`}><ShoppingBagIcon />{t("openTrip")}</Link></Button>} />
    <RelatedRecordCards label={t("related")} items={([
      { id: "goods", label: t("goods"), value: purchase.lines.length, to: "#purchase-goods", icon: PackageIcon, accent: "shopping" },
      { id: "receipts", label: t("receiptTitle"), value: purchase.receipts.length, to: "#purchase-receipts", icon: FolderIcon, accent: "documents" },
      ...(purchase.shopId ? [{ id: "shop", label: purchase.shopName ?? t("shopLabel"), to: `/shops/${encodeURIComponent(purchase.shopId)}`, icon: StoreIcon, accent: "shopping" } satisfies RelatedRecordLink] : []),
      ...(purchase.canReadMoney ? [{ id: "expenses", label: t("expenses"), value: purchase.expenses.length, to: "#purchase-expenses", icon: WalletIcon, accent: "finance" } satisfies RelatedRecordLink] : []),
    ] satisfies RelatedRecordLink[])} />
    {purchase.canReadMoney && <Card><CardTitle>{t("receiptTotal")}</CardTitle><Text size="2xl" weight="semibold" className="tabular-nums">{purchase.totalCents === null ? t("unknownAmount") : formatCurrency(purchase.totalCents, locale)}</Text><Text size="sm" tone="muted">{t("paidExplanation")}</Text></Card>}
    <Card id="purchase-goods" className="scroll-mt-20"><CardTitle>{t("goods")}</CardTitle><GeneralList variant="embedded" label={t("goods")} items={purchase.lines} getKey={(line) => line.id} renderRow={(line) => <Inline gap="md" wrap justify="between">
        <Stack gap="none" className="min-w-0"><span className="font-medium break-words">{line.catalogueProductId ? <Link to={`/inventory/products/${encodeURIComponent(line.catalogueProductId)}`} className="hover:underline">{line.name ?? t("removedProduct")}</Link> : line.name ?? t("removedProduct")}</span>
          <Text size="sm" tone="muted">{t("acquiredQuantity", { quantity: line.quantity, unit: line.unit ?? "" })}</Text>
          <Text size="sm" tone="muted">{line.stockAdded ? t("creditedQuantity", { quantity: line.stockQuantity, unit: line.stockUnit ?? "" }) : t("stockNotAdded")}</Text>
          <Inline gap="none" align="stretch" wrap className="gap-x-4 text-sm">
            {line.stockProductAvailable && <Link to={`/inventory/products/${encodeURIComponent(line.stockProductId)}?workspace=overview#product-stock-history`} className="inline-flex min-h-11 items-center text-primary hover:underline">{t("stockHistory")}</Link>}
            {line.requirementIds.map((id, index) => <Link key={id} to={`/shopping/items/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center text-primary hover:underline">{t("sourceNeed", { number: index + 1 })}</Link>)}
          </Inline>
          {line.allocation.explicit && <Stack gap="none" className="mt-1 text-sm text-muted-foreground">{line.allocation.projects.map((part, index) => <span key={part.projectId ?? index} className="mr-3">{part.projectId ? <Link to={`/projects/${encodeURIComponent(part.projectId)}`} className="underline">{part.name}</Link> : part.name}: {part.quantity} {line.unit}</span>)}
            {line.allocation.householdQuantity > 0 && <span className="mr-3">{t("allocation.household")}: {line.allocation.householdQuantity} {line.unit}</span>}
            {line.allocation.unallocatedQuantity > 0 && <span>{t("allocation.remaining", { quantity: line.allocation.unallocatedQuantity, unit: line.unit ?? "" })}</span>}
          </Stack>}
        </Stack>
        <Inline gap="sm" align="center" wrap>{canAllocate && <GoodsAllocationDialog allocation={line.allocation} />}<Badge variant={line.stockAdded ? "success" : "secondary"}>{t(line.stockAdded ? "stockAdded" : "stockNotAdded")}</Badge></Inline>
      </Inline>} emptyState={null} /></Card>
    <Card id="purchase-receipts" className="scroll-mt-20"><CardTitle>{t("receiptTitle")}</CardTitle>{purchase.receipts.length ? <GeneralList variant="embedded" label={t("receiptTitle")} items={purchase.receipts} getKey={(receipt) => receipt.id} renderRow={(receipt) => <Inline gap="none" wrap className="gap-x-3">{receipt.documentId ? <>
      <Link to={`/documents/files/${encodeURIComponent(receipt.documentId)}`} className="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium break-words hover:underline"><ReceiptIcon className="size-4 shrink-0" />{receipt.name}</Link>
      <a href={documentContentUrl(receipt.documentId)} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline" target="_blank" rel="noreferrer"><DownloadIcon className="size-4" />{t("openReceipt")}</a>
    </> : receipt.name}</Inline>} emptyState={null} /> : <Text size="sm" tone="muted">{t("noReceipt")}</Text>}</Card>
    {purchase.canReadMoney && <Card id="purchase-expenses" className="scroll-mt-20"><CardTitle>{t("expenses")}</CardTitle><GeneralList variant="embedded" label={t("expenses")} items={purchase.expenses} getKey={(expense) => expense.id} renderRow={(expense) => <Inline gap="md" justify="between" className="min-h-11"><Link to={`/expenses/${encodeURIComponent(expense.id)}`} className="font-medium hover:underline">{expense.name}</Link><span className="tabular-nums">{formatCurrency(expense.amountCents, locale)} · {t(expense.paidOn ? "paid" : "unpaid")}</span></Inline>} emptyState={null} />{!purchase.expenses.length && <Text size="sm" tone="muted">{t("noExpense")}</Text>}{payments}</Card>}
  </PageContainer>;
}
