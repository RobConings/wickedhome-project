import { Stack } from "@/components/layout/stack";
import { GeneralList } from "@/components/shared/general-list";
import { Text } from "@/components/ui/text";
import { ChevronLeftIcon, ChevronRightIcon, TicketIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardTitle } from "@/components/shared/card";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { InlineAlert } from "@/components/shared/inline-alert";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { VoucherDetail } from "../types/income";
import { dateText, money } from "../components/use-income-text";

export function VoucherDetailScreen({ detail }: { detail: VoucherDetail }) {
  const { t } = useTranslation("income");
  const [search] = useSearchParams();
  const { person, balance, receipts, spending } = detail;
  const pages = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));
  const href = (key: string, page: number) => { const params = new URLSearchParams(search); params.set(key, String(page)); return `?${params}`; };
  const pager = (key: string, value: { total: number; page: number; pageSize: number }) => <nav aria-label={t(key === "receiptPage" ? "voucherDetail.receiptPages" : "voucherDetail.spendingPages")} className="flex flex-wrap items-center justify-between gap-2">
    {value.page > 1 ? <Button asChild variant="outline" size="sm"><RecordLink to={href(key, value.page - 1)}><ChevronLeftIcon />{t("detail.previous")}</RecordLink></Button> : <span />}
    <span className="text-sm text-muted-foreground">{t("detail.pageOf", { page: value.page, pages: pages(value.total, value.pageSize) })}</span>
    {value.page < pages(value.total, value.pageSize) ? <Button asChild variant="outline" size="sm"><RecordLink to={href(key, value.page + 1)}>{t("detail.next")}<ChevronRightIcon /></RecordLink></Button> : <span />}
  </nav>;
  return <PageContainer>
    <PageHeader icon={TicketIcon} title={t("voucherDetail.title", { name: person.name })} description={t("voucherDetail.asOf", { date: dateText(detail.today) })} backTo="/income" actions={<Button asChild variant="outline"><RecordLink to={`/habitants/${encodeURIComponent(person.id)}`}>{person.name}</RecordLink></Button>} />
    {balance.expiringSoon && <InlineAlert>{t("vouchers.soon", { name: person.name, amount: money(balance.expiringSoon.amountCents), date: dateText(balance.expiringSoon.date) })}</InlineAlert>}
    <Card tone="featured"><CardTitle>{t("voucherDetail.available")}</CardTitle><Text size="3xl" weight="semibold" className="tabular-nums">{money(balance.availableCents)}</Text><DescriptionList>
      <DescriptionItem label={t("voucherDetail.received")}>{money(balance.receivedCents)}</DescriptionItem><DescriptionItem label={t("voucherDetail.spent")}>{money(balance.spentCents)}</DescriptionItem>
      <DescriptionItem label={t("voucherDetail.expired")}>{money(balance.expiredCents)}</DescriptionItem><DescriptionItem label={t("voucherDetail.uncovered")}>{money(balance.uncoveredCents)}</DescriptionItem>
      <DescriptionItem wide label={t("voucherDetail.nextExpiry")}>{balance.nextExpiry ? `${money(balance.nextExpiry.amountCents)} · ${dateText(balance.nextExpiry.date)}` : t("voucherDetail.noExpiry")}</DescriptionItem>
    </DescriptionList></Card>
    <Text size="sm" tone="muted">{t("voucherDetail.meaning")}</Text>
    <PageGrid columns="2" className="items-start">
      <Card><CardTitle>{t("voucherDetail.receipts", { count: receipts.total })}</CardTitle>{receipts.items.length ? <GeneralList variant="embedded" label={t("voucherDetail.receipts", { count: receipts.total })} items={receipts.items} getKey={(income) => income.id} renderRow={(income) => <Stack gap="none" className="space-y-1">
        <RecordLink to={`/income/receipts/${encodeURIComponent(income.id)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 font-medium hover:underline"><span>{dateText(income.date)}</span><span className="tabular-nums">{money(income.amountCents)}</span></RecordLink>
        {income.description && <Text size="sm" className="break-words">{income.description}</Text>}<Text size="xs" tone="muted">{t("voucherDetail.creditExpiry", { date: dateText(income.expiresOn) })}</Text>
      </Stack>} emptyState={null} /> : <Text size="sm" tone="muted">{t("voucherDetail.noReceipts")}</Text>}{pager("receiptPage", receipts)}</Card>
      <Card><CardTitle>{t("voucherDetail.spending", { count: spending.total })}</CardTitle>{spending.items.length ? <GeneralList variant="embedded" label={t("voucherDetail.spending", { count: spending.total })} items={spending.items} getKey={(payment) => `${payment.expenseId}:${payment.habitantId}`} renderRow={(payment) => <>
        <RecordLink to={`/expenses/${encodeURIComponent(payment.expenseId)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 font-medium hover:underline"><span className="min-w-0 break-words">{payment.payee}</span><span className="tabular-nums">{money(payment.amountCents)}</span></RecordLink><Text size="xs" tone="muted">{dateText(payment.date)}</Text>
      </>} emptyState={null} /> : <Text size="sm" tone="muted">{t("voucherDetail.noSpending")}</Text>}{pager("spendingPage", spending)}</Card>
    </PageGrid>
  </PageContainer>;
}
