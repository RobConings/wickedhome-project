import { BanknoteIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import { IncomeFormDialog } from "../components/income-form-dialog";
import { dateText, money, useWhoName } from "../components/use-income-text";
import type { IncomeActionResult } from "../data/income-loaders";
import type { Income, IncomeOverview, IncomeSource } from "../types/income";

export function IncomeRecordScreen({ income, source, overview, habitants, canManage }: {
  income: Income; source: IncomeSource | null; overview: IncomeOverview; habitants: Habitant[]; canManage: boolean;
}) {
  const { t } = useTranslation("income");
  const { t: tc } = useTranslation();
  const whoName = useWhoName(habitants);
  const fetcher = useFetcher<IncomeActionResult>();
  const account = overview.accounts.find((row) => row.id === income.targetAccountId);
  const title = income.description ?? source?.name ?? t(`kinds.${income.kind}`);
  return <PageContainer>
    <PageHeader title={title} icon={BanknoteIcon} backTo="/income?view=received" description={t(income.date > overview.today ? "status.upcoming" : "status.received", { date: dateText(income.date) })} actions={canManage && <>
      <IncomeFormDialog income={income} sourceName={source?.name} habitants={habitants} accounts={overview.accounts} today={overview.today} trigger={<Button><PencilIcon />{t("actions.editIncome")}</Button>} />
      <ConfirmDialog trigger={<Button variant="outline"><Trash2Icon />{t("actions.delete")}</Button>} title={t("form.deleteIncomeTitle")} description={t("form.deleteIncomeDescription")} confirmLabel={t("actions.delete")} cancelLabel={tc("actions.cancel")} destructive onConfirm={() => fetcher.submit({ intent: "delete-income", id: income.id }, { method: "post" })} />
    </>} />
    {fetcher.data?.formError && <p role="alert" className="text-destructive">{fetcher.data.formError}</p>}
    <Card className="border-primary/20 bg-primary/5"><p className="text-3xl font-semibold tabular-nums">{money(income.amountCents)}</p><p className="text-sm text-muted-foreground">{t(income.kind === "meal_vouchers" ? "detail.voucherHint" : "detail.moneyHint")}</p></Card>
    <Card><CardTitle>{t("detail.receipt")}</CardTitle><DescriptionList>
      <DescriptionItem label={t("fields.who")}>{income.habitantId && habitants.some((person) => person.id === income.habitantId) ? <RecordLink className="underline" to={`/habitants/${encodeURIComponent(income.habitantId)}`}>{whoName(income.habitantId)}</RecordLink> : whoName(income.habitantId)}</DescriptionItem>
      <DescriptionItem label={t("fields.kind")}>{t(`kinds.${income.kind}`)}</DescriptionItem>
      <DescriptionItem label={t("fields.date")}>{dateText(income.date)}</DescriptionItem>
      <DescriptionItem label={t("detail.period")}>{income.periodDate ? dateText(income.periodDate) : t("month.oneOff")}</DescriptionItem>
      <DescriptionItem label={t("detail.source")}>{source ? <RecordLink className="underline" to={`/income/sources/${encodeURIComponent(source.id)}?month=${income.periodDate?.slice(0, 7) ?? income.date.slice(0, 7)}`}>{source.name}</RecordLink> : t("month.oneOff")}</DescriptionItem>
      <DescriptionItem label={t("fields.targetAccount")}>{account ? <RecordLink className="underline" to={`/money?tab=history&account=${encodeURIComponent(account.id)}&month=${income.date.slice(0, 7)}`}>{account.name}</RecordLink> : t("detail.noAccount")}</DescriptionItem>
      {income.note && <DescriptionItem wide label={t("fields.note")}><span className="whitespace-pre-wrap">{income.note}</span></DescriptionItem>}
    </DescriptionList></Card>
  </PageContainer>;
}
