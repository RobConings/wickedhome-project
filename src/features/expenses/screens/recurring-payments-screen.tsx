import { Text } from "@/components/ui/text";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, ListIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardTitle } from "@/components/shared/card";
import { RecordLink } from "@/components/shared/record-link";
import { SectionNavigation } from "@/components/shared/section-navigation";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import type { RecurringPayments } from "../types/expenses";
import { HistoryList } from "./expense-detail-screen";

/** A bounded page over every stored occurrence, independent of overview/history preview limits. */
export function RecurringPaymentsScreen({ payments, habitants }: { payments: RecurringPayments; habitants: Habitant[] }) {
  const { t } = useTranslation("expenses");
  const [search] = useSearchParams();
  const status = search.get("status") ?? "all";
  const base = `/expenses/recurring/${encodeURIComponent(payments.recurring.id)}`;
  const href = (nextStatus: string, page = 1) => {
    const next = new URLSearchParams(search);
    next.set("status", nextStatus);
    if (page > 1) next.set("page", String(page)); else next.delete("page");
    return `${base}/payments?${next}`;
  };
  const pages = Math.max(1, Math.ceil(payments.total / payments.pageSize));
  return <PageContainer>
    <PageHeader title={payments.recurring.payee} eyebrow={t("workspace.allPayments")} description={t("workspace.allPaymentsHint")} backTo={base}
      actions={<Button asChild variant="outline"><RecordLink to={base}>{t("workspace.manageSchedule")}</RecordLink></Button>} />
    <SectionNavigation label={t("workspace.paymentFilters")} items={[
      { id: "all", label: t("workspace.all"), to: href("all"), icon: ListIcon, current: status === "all" },
      { id: "paid", label: t("status.paid"), to: href("paid"), icon: CheckIcon, current: status === "paid" },
      { id: "unpaid", label: t("detail.notPaid"), to: href("unpaid"), icon: ClockIcon, current: status === "unpaid" },
    ]} />
    <Card><CardTitle>{t("workspace.paymentCount", { count: payments.total })}</CardTitle>
      {payments.items.length ? <HistoryList items={payments.items} habitants={habitants} /> : <Text size="sm" tone="muted">{t("detail.noHistory")}</Text>}
    </Card>
    <nav aria-label={t("workspace.pagination")} className="flex flex-wrap items-center justify-between gap-3">
      {payments.page > 1 ? <Button asChild variant="outline"><RecordLink to={href(status, payments.page - 1)}><ChevronLeftIcon />{t("workspace.previous")}</RecordLink></Button> : <span />}
      <Text size="sm" tone="muted">{t("workspace.pageOf", { page: payments.page, pages })}</Text>
      {payments.page < pages ? <Button asChild variant="outline"><RecordLink to={href(status, payments.page + 1)}>{t("workspace.next")}<ChevronRightIcon /></RecordLink></Button> : <span />}
    </nav>
  </PageContainer>;
}
