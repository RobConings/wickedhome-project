import { GeneralList } from "@/components/shared/general-list";
import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
import { HandCoinsIcon, PencilIcon, Trash2Icon, ArrowLeftRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useSearchParams } from "react-router";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { Card, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DescriptionItem, DescriptionList } from "@/components/shared/description-list";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { RecordLink } from "@/components/shared/record-link";
import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import type { Habitant } from "@/features/household";
import { addMonthsClamped } from "@/types/dates";
import { ContributionPlanDialog } from "../components/contribution-plan-dialog";
import { LedgerList } from "../components/ledger-list";
import { RecordTransferDialog } from "../components/record-transfer-dialog";
import { dateText, money, monthLabel } from "../components/use-money-text";
import type { MoneyActionResult } from "../data/money-loaders";
import { planActiveIn } from "../types/money-calculations";
import type { ContributionPlan, MoneyMonth } from "../types/money";

export function ContributionPlanScreen({ plan, month, habitants, canManage }: { plan: ContributionPlan; month: MoneyMonth; habitants: Habitant[]; canManage: boolean }) {
  const { t } = useTranslation("money");
  const { t: common } = useTranslation();
  const fetcher = useFetcher<MoneyActionResult>();
  const [, setSearch] = useSearchParams();
  const person = habitants.find((candidate) => candidate.id === plan.habitantId);
  const account = month.accounts.find((candidate) => candidate.id === plan.accountId);
  const row = month.contributions.find((candidate) => candidate.habitantId === plan.habitantId && candidate.accountId === plan.accountId);
  const activity = month.accountMonths.find((candidate) => candidate.accountId === plan.accountId)?.lines.filter((line) => line.type === "contribution" && line.habitantId === plan.habitantId) ?? [];
  const related = month.plans.filter((candidate) => candidate.id !== plan.id && candidate.habitantId === plan.habitantId && candidate.accountId === plan.accountId);
  const active = planActiveIn(plan, month.month);
  const changeMonth = (value: string) => setSearch((previous) => { const next = new URLSearchParams(previous); next.set("month", value); return next; }, { preventScrollReset: true });
  const shift = (offset: number) => changeMonth(addMonthsClamped(`${month.month}-01`, offset).slice(0, 7));
  return <PageContainer>
    <PageHeader icon={HandCoinsIcon} title={t("planWorkspace.title")} description={`${person?.name ?? t("history.unknownPerson")} → ${account?.name ?? t("planWorkspace.unknownAccount")}`} backTo="/money?tab=settlement" actions={canManage && <>
      {account && !account.archived && person && <RecordTransferDialog accounts={month.accounts} habitants={habitants} today={month.today} defaults={{ from: `habitant:${person.id}`, toAccountId: account.id, amountCents: row?.remainingCents || null }} trigger={<Button><ArrowLeftRightIcon />{t("actions.recordTransfer")}</Button>} />}
      <ContributionPlanDialog plan={plan} accounts={month.accounts} habitants={habitants} monthStart={`${month.month}-01`} trigger={<Button variant="outline"><PencilIcon />{t("actions.editPlan")}</Button>} />
      <ConfirmDialog trigger={<Button variant="outline"><Trash2Icon />{common("actions.delete")}</Button>} title={t("planWorkspace.deleteTitle")} description={t("planWorkspace.deleteHint")} destructive confirmLabel={common("actions.delete")} cancelLabel={common("actions.cancel")} onConfirm={() => fetcher.submit({ intent: "delete-plan", id: plan.id }, { method: "post" })} />
    </>} />
    {fetcher.data?.formError && <Text tone="danger" role="alert">{fetcher.data.formError}</Text>}
    <PageGrid columns="main-sidebar">
      <Stack gap="5" className="min-w-0">
        <Card tone="featured"><CardTitle>{t("planWorkspace.schedule")}</CardTitle><Text size="3xl" weight="semibold" className="tabular-nums">{money(plan.amountCents)}</Text><Text size="sm">{t("contributions.planAmount", { amount: money(plan.amountCents), day: plan.dayOfMonth })}</Text>
          <DescriptionList>
            <DescriptionItem label={t("fields.who")}>{person ? <RecordLink to={`/habitants/${encodeURIComponent(person.id)}`} className="underline">{person.name}</RecordLink> : t("history.unknownPerson")}</DescriptionItem>
            <DescriptionItem label={t("fields.account")}>{account ? <RecordLink to={`/money?tab=history&account=${encodeURIComponent(account.id)}&month=${month.month}`} className="underline">{account.name}</RecordLink> : t("planWorkspace.unknownAccount")}</DescriptionItem>
            <DescriptionItem label={t("fields.activeFrom")}>{dateText(plan.activeFrom)}</DescriptionItem><DescriptionItem label={t("fields.activeTo")}>{plan.activeTo ? dateText(plan.activeTo) : t("planWorkspace.noEnd")}</DescriptionItem>
            {plan.note && <DescriptionItem wide label={t("fields.note")}><span className="whitespace-pre-wrap">{plan.note}</span></DescriptionItem>}
          </DescriptionList>
        </Card>
        <PeriodNavigator label={monthLabel(month.month)} onPrevious={() => shift(-1)} onNext={() => shift(1)} onToday={() => changeMonth(month.today.slice(0, 7))} previousLabel={t("month.previous")} nextLabel={t("month.next")} todayLabel={t("month.today")} isCurrent={month.month === month.today.slice(0, 7)} />
        <Text size="sm" tone="muted">{t(active ? "planWorkspace.activeMonth" : "planWorkspace.inactiveMonth")}</Text>
        <PageGrid columns="2"><StatTile label={t("planWorkspace.planned")} value={money(row?.plannedCents ?? 0)} /><StatTile label={t("planWorkspace.recorded")} value={money(row?.recordedCents ?? 0)} /></PageGrid>
        <Text size="sm" tone="muted">{t("planWorkspace.activityHint")}</Text>
        <LedgerList lines={activity} accounts={month.accounts} habitants={habitants} canManage={canManage} storageKey="plan-activity" />
      </Stack>
      <Card className="self-start"><CardTitle>{t("planWorkspace.related")}</CardTitle>{related.length ? <GeneralList variant="embedded" label={t("planWorkspace.related")} items={related} getKey={(candidate) => candidate.id} renderRow={(candidate) => <><RecordLink to={`/money/plans/${encodeURIComponent(candidate.id)}?month=${month.month}`} className="flex min-h-11 flex-col justify-center gap-1 text-sm hover:underline"><span className="font-medium">{money(candidate.amountCents)}</span><span className="text-muted-foreground">{dateText(candidate.activeFrom)} – {candidate.activeTo ? dateText(candidate.activeTo) : t("planWorkspace.noEnd")}</span></RecordLink></>} emptyState={null} /> : <Text size="sm" tone="muted">{t("planWorkspace.noRelated")}</Text>}</Card>
    </PageGrid>
  </PageContainer>;
}
