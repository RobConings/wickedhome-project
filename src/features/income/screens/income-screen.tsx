import * as React from "react";
import { BanknoteIcon, PencilIcon, PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { Card } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PendingContent } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { SectionHeader } from "@/components/shared/section-header";
import type { Habitant } from "@/features/household";
import { useOpenFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import { IncomeFormDialog } from "../components/income-form-dialog";
import { IncomeMonthTotalsTiles } from "../components/income-month-totals";
import { IncomeOccurrenceList } from "../components/income-occurrence-list";
import { IncomeRow } from "../components/income-row";
import { IncomeSourceFormDialog } from "../components/income-source-form-dialog";
import { IncomeSourceList } from "../components/income-source-list";
import { earners, useWhoName } from "../components/use-income-text";
import { VoucherBalances } from "../components/voucher-balances";
import { INCOME_MONTH_PARAM } from "../data/income-loaders";
import { shiftMonth } from "../types/income-calculations";
import { INCOME_KINDS, JOINT, type Income, type IncomeOverview } from "../types/income";
import { monthLabel } from "@/lib/locale-text";
import { FILTER_ALL, FilterSelect } from "@/components/shared/filter-select";

type IncomeScreenProps = {
  overview: IncomeOverview;
  habitants: Habitant[];
  /** Owners and adults manage incomes; children only look. */
  canManage: boolean;
  /** The logged-in user's habitant, preselected when adding an income. */
  currentHabitantId?: string | null;
};

/** Edit and delete buttons of a received income. */
function IncomeActions({ income, overview, habitants }: { income: Income; overview: IncomeOverview; habitants: Habitant[] }) {
  const { t } = useTranslation("income");
  const fetcher = useFetcher();
  const [editing, setEditing] = React.useState(false);
  return (
    <span className="flex shrink-0 items-center">
      <Button variant="ghost" size="icon" aria-label={t("actions.editIncome")} onClick={() => setEditing(true)}>
        <PencilIcon />
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={t("actions.delete")}>
            <Trash2Icon />
          </Button>
        }
        title={t("form.deleteIncomeTitle")}
        description={t("form.deleteIncomeDescription")}
        confirmLabel={t("actions.delete")}
        destructive
        onConfirm={() => fetcher.submit({ intent: "delete-income", id: income.id }, { method: "post" })}
      />
      {editing && (
        <IncomeFormDialog
          open
          onOpenChange={(open) => !open && setEditing(false)}
          income={income}
          sourceName={overview.sources.find((source) => source.id === income.sourceId)?.name}
          habitants={habitants}
          accounts={overview.accounts}
          today={overview.today}
        />
      )}
    </span>
  );
}

/**
 * Income: the month's totals per person and household, the planned recurring incomes (variable ones ask
 * for their amount), meal voucher balances, the recurring incomes per member and everything received.
 */
export function IncomeScreen({ overview, habitants, canManage, currentHabitantId }: IncomeScreenProps) {
  const { t } = useTranslation("income");
  const { t: tCommon } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const pending = useSamePagePending();
  const whoName = useWhoName(habitants);
  const [whoFilter, setWhoFilter] = React.useState<string>(FILTER_ALL);
  const [kindFilter, setKindFilter] = React.useState<string>(FILTER_ALL);
  // `?new=1` (the dashboard's "Record income") opens the one-off form at once.
  const [openNew, setOpenNew] = useOpenFromUrl(canManage);
  const currentMonth = overview.today.slice(0, 7);

  const goToMonth = (month: string) =>
    setSearchParams(
      (params) => {
        if (month === currentMonth) params.delete(INCOME_MONTH_PARAM);
        else params.set(INCOME_MONTH_PARAM, month);
        return params;
      },
      { preventScrollReset: true },
    );

  const defaultHabitantId = habitants.some((habitant) => habitant.id === currentHabitantId) ? currentHabitantId : null;
  const oneOffDialog = (fromUrl: boolean) =>
    canManage && (
    <IncomeFormDialog
      {...(fromUrl ? { open: openNew, onOpenChange: setOpenNew } : {})}
      trigger={
        <Button>
          <PlusIcon />
          {t("actions.addOneOff")}
        </Button>
      }
      habitants={habitants}
      accounts={overview.accounts}
      today={overview.today}
      defaultHabitantId={defaultHabitantId}
    />
  );
  const recurringButton = (variant: "outline" | "default" = "outline") =>
    canManage && (
      <IncomeSourceFormDialog
        trigger={
          <Button variant={variant}>
            <RepeatIcon />
            {t("actions.addRecurring")}
          </Button>
        }
        habitants={habitants}
        accounts={overview.accounts}
        today={overview.today}
        defaultHabitantId={defaultHabitantId}
      />
    );

  const incomes = overview.incomes.filter(
    (income) => (whoFilter === FILTER_ALL || (income.habitantId ?? JOINT) === whoFilter) && (kindFilter === FILTER_ALL || income.kind === kindFilter),
  );
  const people = [...earners(habitants).map((habitant) => habitant.id), JOINT];

  return (
    <PageContainer>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            {recurringButton()}
            {oneOffDialog(true)}
          </>
        }
      />

      <PageSection className="gap-4">
        <PeriodNavigator
          label={monthLabel(overview.month)}
          onPrevious={() => goToMonth(shiftMonth(overview.month, -1))}
          onNext={() => goToMonth(shiftMonth(overview.month, 1))}
          onToday={() => goToMonth(currentMonth)}
          previousLabel={t("month.previous")}
          nextLabel={t("month.next")}
          todayLabel={t("month.today")}
          isCurrent={overview.month === currentMonth}
          pending={pending}
        />
        <PendingContent pending={pending} label={tCommon("loading.updating")} contentClassName="flex flex-col gap-4">
          <IncomeMonthTotalsTiles totals={overview.totals} habitants={habitants} />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <IncomeOccurrenceList
                occurrences={overview.occurrences}
                upcoming={overview.upcoming}
                habitants={habitants}
                accounts={overview.accounts}
                today={overview.today}
                canManage={canManage}
              />
            </div>
            <VoucherBalances balances={overview.vouchers} habitants={habitants} />
          </div>
        </PendingContent>
      </PageSection>

      <PageSection className="gap-4">
        <SectionHeader title={t("sources.title")} description={t("sources.description")} />
        {overview.sources.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title={t("empty.sources.title")}
            description={t("empty.sources.description")}
            action={recurringButton("default")}
          />
        ) : (
          <IncomeSourceList
            sources={overview.sources}
            habitants={habitants}
            accounts={overview.accounts}
            today={overview.today}
            canManage={canManage}
          />
        )}
      </PageSection>

      <PageSection className="gap-4">
        <SectionHeader title={t("incomes.title")} />
        <GeneralList
          label={t("incomes.label")}
          items={incomes}
          getKey={(income) => income.id}
          renderRow={(income) => (
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <IncomeRow income={income} habitants={habitants} sources={overview.sources} accounts={overview.accounts} today={overview.today} />
              </div>
              {canManage && <IncomeActions income={income} overview={overview} habitants={habitants} />}
            </div>
          )}
          renderTile={(income) => (
            <Card className="h-full">
              <IncomeRow income={income} habitants={habitants} sources={overview.sources} accounts={overview.accounts} today={overview.today} tile />
            </Card>
          )}
          search={{
            placeholder: t("incomes.searchPlaceholder"),
            keys: (income) => [
              income.description,
              income.note,
              t(`kinds.${income.kind}`),
              whoName(income.habitantId),
              overview.sources.find((source) => source.id === income.sourceId)?.name,
            ],
          }}
          storageKey="incomes"
          groupBy={(income) => income.date.slice(0, 7)}
          renderGroupHeader={(month) => <span className="first-letter:uppercase">{monthLabel(month)}</span>}
          filtered={whoFilter !== FILTER_ALL || kindFilter !== FILTER_ALL}
          toolbar={
            <div className="flex flex-col gap-3 sm:flex-row">
              <FilterSelect
                label={t("who.label")}
                value={whoFilter}
                onValueChange={setWhoFilter}
                allLabel={t("who.everyone")}
                options={people.map((key) => ({ value: key, label: whoName(key) }))}
                className="w-full sm:w-44"
              />
              <FilterSelect
                label={t("incomes.kindFilter")}
                value={kindFilter}
                onValueChange={setKindFilter}
                allLabel={t("incomes.allKinds")}
                options={INCOME_KINDS.map((kind) => ({ value: kind, label: t(`kinds.${kind}`) }))}
              />
            </div>
          }
          emptyState={
            <EmptyState icon={BanknoteIcon} title={t("empty.incomes.title")} description={t("empty.incomes.description")} action={oneOffDialog(false)} />
          }
        />
      </PageSection>
    </PageContainer>
  );
}
