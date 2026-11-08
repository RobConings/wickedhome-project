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
    {purchase.canReadMoney && <Card><CardTitle>{t("receiptTotal")}</CardTitle><p className="text-2xl font-semibold tabular-nums">{purchase.totalCents === null ? t("unknownAmount") : formatCurrency(purchase.totalCents, locale)}</p><p className="text-sm text-muted-foreground">{t("paidExplanation")}</p></Card>}
    <Card id="purchase-goods" className="scroll-mt-20"><CardTitle>{t("goods")}</CardTitle><ul className="divide-y">
      {purchase.lines.map((line) => <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><span className="font-medium break-words">{line.catalogueProductId ? <Link to={`/inventory/products/${encodeURIComponent(line.catalogueProductId)}`} className="hover:underline">{line.name ?? t("removedProduct")}</Link> : line.name ?? t("removedProduct")}</span>
          <p className="text-sm text-muted-foreground">{t("acquiredQuantity", { quantity: line.quantity, unit: line.unit ?? "" })}</p>
          <p className="text-sm text-muted-foreground">{line.stockAdded ? t("creditedQuantity", { quantity: line.stockQuantity, unit: line.stockUnit ?? "" }) : t("stockNotAdded")}</p>
          <div className="flex flex-wrap gap-x-4 text-sm">
            {line.stockProductAvailable && <Link to={`/inventory/products/${encodeURIComponent(line.stockProductId)}?workspace=overview#product-stock-history`} className="inline-flex min-h-11 items-center text-primary hover:underline">{t("stockHistory")}</Link>}
            {line.requirementIds.map((id, index) => <Link key={id} to={`/shopping/items/${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center text-primary hover:underline">{t("sourceNeed", { number: index + 1 })}</Link>)}
          </div>
          {line.allocation.explicit && <div className="mt-1 text-sm text-muted-foreground">{line.allocation.projects.map((part, index) => <span key={part.projectId ?? index} className="mr-3">{part.projectId ? <Link to={`/projects/${encodeURIComponent(part.projectId)}`} className="underline">{part.name}</Link> : part.name}: {part.quantity} {line.unit}</span>)}
            {line.allocation.householdQuantity > 0 && <span className="mr-3">{t("allocation.household")}: {line.allocation.householdQuantity} {line.unit}</span>}
            {line.allocation.unallocatedQuantity > 0 && <span>{t("allocation.remaining", { quantity: line.allocation.unallocatedQuantity, unit: line.unit ?? "" })}</span>}
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{canAllocate && <GoodsAllocationDialog allocation={line.allocation} />}<Badge variant={line.stockAdded ? "success" : "secondary"}>{t(line.stockAdded ? "stockAdded" : "stockNotAdded")}</Badge></div>
      </li>)}
    </ul></Card>
    <Card id="purchase-receipts" className="scroll-mt-20"><CardTitle>{t("receiptTitle")}</CardTitle>{purchase.receipts.length ? <ul>{purchase.receipts.map((receipt) => <li key={receipt.id} className="flex flex-wrap items-center gap-x-3 py-2">{receipt.documentId ? <>
      <Link to={`/documents/files/${encodeURIComponent(receipt.documentId)}`} className="inline-flex min-h-11 min-w-0 items-center gap-2 font-medium break-words hover:underline"><ReceiptIcon className="size-4 shrink-0" />{receipt.name}</Link>
      <a href={documentContentUrl(receipt.documentId)} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline" target="_blank" rel="noreferrer"><DownloadIcon className="size-4" />{t("openReceipt")}</a>
    </> : receipt.name}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t("noReceipt")}</p>}</Card>
    {purchase.canReadMoney && <Card id="purchase-expenses" className="scroll-mt-20"><CardTitle>{t("expenses")}</CardTitle><ul>{purchase.expenses.map((expense) => <li key={expense.id} className="flex min-h-11 items-center justify-between gap-3"><Link to={`/expenses/${encodeURIComponent(expense.id)}`} className="font-medium hover:underline">{expense.name}</Link><span className="tabular-nums">{formatCurrency(expense.amountCents, locale)} · {t(expense.paidOn ? "paid" : "unpaid")}</span></li>)}</ul>{!purchase.expenses.length && <p className="text-sm text-muted-foreground">{t("noExpense")}</p>}{payments}</Card>}
  </PageContainer>;
}
