import { Stack } from "@/components/layout/stack";
import { GeneralList } from "@/components/shared/general-list";
import { Text } from "@/components/ui/text";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useSearchParams } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import { IncomeOccurrenceList } from "../components/income-occurrence-list";
import { IncomeRow } from "../components/income-row";
import { IncomeSourceFormDialog } from "../components/income-source-form-dialog";
import { dateText, money, monthLabel, useRecurrenceText, useWhoName } from "../components/use-income-text";
import type { IncomeActionResult } from "../data/income-loaders";
import { shiftMonth } from "../types/income-calculations";
import type { IncomeOverview, IncomeSourceDetail } from "../types/income";

export function IncomeSourceScreen({ detail, overview, habitants, canManage }: {
  detail: IncomeSourceDetail; overview: IncomeOverview; habitants: Habitant[]; canManage: boolean;
}) {
  const { t } = useTranslation("income");
  const { t: tc } = useTranslation();
  const whoName = useWhoName(habitants);
  const recurrence = useRecurrenceText();
  const fetcher = useFetcher<IncomeActionResult>();
  const [search, setSearch] = useSearchParams();
  const { source, history } = detail;
  const account = overview.accounts.find((row) => row.id === source.targetAccountId);
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
  const pageHref = (page: number) => { const next = new URLSearchParams(search); next.set("page", String(page)); return `?${next}`; };
  const month = (value: string) => setSearch((current) => { current.set("month", value); return current; });
  return <PageContainer>
    <PageHeader title={source.name} icon={RepeatIcon} backTo="/income?view=sources" description={`${whoName(source.habitantId)} · ${t(`kinds.${source.kind}`)}`} actions={canManage && <>
      <IncomeSourceFormDialog source={source} habitants={habitants} accounts={overview.accounts} today={overview.today} trigger={<Button><PencilIcon />{t("actions.edit")}</Button>} />
      <ConfirmDialog trigger={<Button variant="outline"><Trash2Icon />{t("actions.delete")}</Button>} title={t("form.deleteSourceTitle", { name: source.name })} description={t("form.deleteSourceDescription")} confirmLabel={t("actions.delete")} cancelLabel={tc("actions.cancel")} destructive onConfirm={() => fetcher.submit({ intent: "delete-source", id: source.id }, { method: "post" })} />
    </>} />
    {fetcher.data?.formError && <Text tone="danger" role="alert">{fetcher.data.formError}</Text>}
    <Card><CardTitle>{t("detail.schedule")}</CardTitle><DescriptionList>
      <DescriptionItem label={t("detail.schedule")}>{recurrence(source.rrule)}</DescriptionItem>
      <DescriptionItem label={t("detail.amountMode")}>{t(`modes.${source.amountMode}`)}</DescriptionItem>
      <DescriptionItem label={t("detail.starts")}>{dateText(source.startDate)}</DescriptionItem>
      <DescriptionItem label={t("detail.ends")}>{source.endDate ? dateText(source.endDate) : t("detail.noEnd")}</DescriptionItem>
      <DescriptionItem label={t("fields.amount")}>{source.currentAmountCents === null ? t("detail.notRecorded") : money(source.currentAmountCents)}</DescriptionItem>
      <DescriptionItem label={t("fields.targetAccount")}>{account ? <RecordLink className="underline" to={`/money?tab=history&account=${encodeURIComponent(account.id)}`}>{account.name}</RecordLink> : t("detail.noAccount")}</DescriptionItem>
      {source.notes && <DescriptionItem wide label={t("fields.notes")}><span className="whitespace-pre-wrap">{source.notes}</span></DescriptionItem>}
    </DescriptionList></Card>
    {source.amounts.length > 0 && <Card><CardTitle>{t("sources.history")}</CardTitle><GeneralList variant="embedded" label={t("sources.history")} items={[...source.amounts].reverse()} getKey={(amount) => amount.id} renderRow={(amount) => <Stack gap="none" className="text-sm">{t("sources.amountFrom", { date: dateText(amount.effectiveFrom), amount: money(amount.amountCents) })}</Stack>} emptyState={null} /></Card>}
    <PeriodNavigator label={monthLabel(detail.month)} onPrevious={() => month(shiftMonth(detail.month, -1))} onNext={() => month(shiftMonth(detail.month, 1))} onToday={() => month(overview.today.slice(0, 7))} previousLabel={t("month.previous")} nextLabel={t("month.next")} todayLabel={t("month.today")} isCurrent={detail.month === overview.today.slice(0, 7)} />
    <IncomeOccurrenceList occurrences={detail.occurrences} habitants={habitants} accounts={overview.accounts} today={overview.today} canManage={canManage} />
    <Card><CardTitle>{t("detail.history", { count: history.total })}</CardTitle>
      {history.items.length ? <GeneralList variant="embedded" label={t("detail.history", { count: history.total })} items={history.items} getKey={(income) => income.id} renderRow={(income) => <><IncomeRow income={income} sources={[source]} habitants={habitants} accounts={overview.accounts} today={overview.today} /></>} emptyState={null} /> : <Text size="sm" tone="muted">{t("detail.noReceipts")}</Text>}
      <nav aria-label={t("detail.pagination")} className="flex flex-wrap items-center justify-between gap-3">
        {history.page > 1 ? <Button asChild variant="outline"><Link to={pageHref(history.page - 1)}><ChevronLeftIcon />{t("detail.previous")}</Link></Button> : <span />}
        <Text size="sm" tone="muted">{t("detail.pageOf", { page: history.page, pages })}</Text>
        {history.page < pages ? <Button asChild variant="outline"><Link to={pageHref(history.page + 1)}>{t("detail.next")}<ChevronRightIcon /></Link></Button> : <span />}
      </nav>
    </Card>
  </PageContainer>;
}
