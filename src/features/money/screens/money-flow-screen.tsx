import * as React from "react";
import { ArrowLeftRightIcon, ChartNoAxesCombinedIcon, HistoryIcon, ScaleIcon, UsersIcon, FolderKanbanIcon, LandmarkIcon, PiggyBankIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { ScrollRow } from "@/components/layout/scroll-row";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PendingContent } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { PeriodNavigator } from "@/components/shared/period-navigator";
import { SectionNavigation } from "@/components/shared/section-navigation";
import { SectionHeader } from "@/components/shared/section-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { Habitant } from "@/features/household";
import { useSamePagePending } from "@/lib/pending";
import { addMonthsClamped } from "@/types/dates";
import { AccountCard } from "../components/account-card";
import { AccountFormDialog } from "../components/account-form-dialog";
import { AddAccountCard } from "../components/add-account-card";
import { ContributionHistory } from "../components/contribution-history";
import { ContributionsCard } from "../components/contributions-card";
import { CoverageCard } from "../components/coverage-card";
import { IncomeFlowCard } from "../components/income-flow-card";
import { JointOutgoingsCard } from "../components/joint-outgoings-card";
import { LedgerList } from "../components/ledger-list";
import { LoansCard } from "../components/loans-card";
import { MoneyCardHeader } from "../components/money-card-header";
import { MoneyTimelineCard } from "../components/money-timeline-card";
import { RecordTransferDialog } from "../components/record-transfer-dialog";
import { monthLabel } from "../components/use-money-text";
import { MONEY_MONTH_PARAM } from "../data/money-loaders";
import type { ContributionHistory as ContributionHistoryData, MoneyLoans, MoneyMonth, MoneyTimeline } from "../types/money";

type MoneyFlowScreenProps = {
  data: MoneyMonth;
  contributionHistory: ContributionHistoryData;
  habitants: Habitant[];
  /** Owners and adults manage the joint accounts; children only look. */
  canManage: boolean;
  /** "Next to pay" for the joint account and per person (from the expenses feature, composed by the route). */
  nextToPay?: React.ReactNode;
  /** Meal voucher balances (from the income feature, composed by the route). */
  vouchers?: React.ReactNode;
  /** Project budgets of the month (from the projects feature, composed by the route). */
  projects?: React.ReactNode;
  /** Loans and down payments with what is still open; a deferred promise from the loader. Left out: no card. */
  loans?: MoneyLoans | Promise<MoneyLoans | null> | null;
  /** Income and expenses per month, past and future; a deferred promise from the loader. Left out: no chart. */
  timeline?: MoneyTimeline | Promise<MoneyTimeline | null> | null;
};

const shift = (month: string, months: number) => addMonthsClamped(`${month}-01`, months).slice(0, 7);

/** Columns for a row of `count` account cards: never a lonely card next to empty space. */
const accountColumns = (count: number) => (count >= 3 ? "3" : count === 2 ? "2" : "1");

/** Money overview, contribution history, monthly settlement and account ledger in focused tabs. */
export function MoneyFlowScreen({ data, contributionHistory, habitants, canManage, nextToPay, vouchers, projects, loans, timeline }: MoneyFlowScreenProps) {
  const { t } = useTranslation("money");
  const { t: tCommon } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab = requestedTab && ["contributions", "settlement", "history"].includes(requestedTab) ? requestedTab : "overview";
  const tabLink = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "overview") params.delete("tab");
    else params.set("tab", value);
    return { search: params.size ? `?${params}` : "" };
  };
  const accountActivityLink = (id: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "history");
    params.set("account", id);
    return { search: `?${params}` };
  };
  const pending = useSamePagePending();
  const currentMonth = data.today.slice(0, 7);
  const active = data.accounts.filter((account) => !account.archived);
  const archived = data.accounts.filter((account) => account.archived);
  const historyAccountId = searchParams.get("account") ?? active[0]?.id ?? data.accounts[0]?.id ?? "";
  const setHistoryAccountId = (value: string) => setSearchParams((params) => {
    params.set("account", value);
    return params;
  }, { preventScrollReset: true });
  const historyAccount = data.accounts.find((account) => account.id === historyAccountId) ?? active[0] ?? data.accounts[0];
  const historyMonth = data.accountMonths.find((item) => item.accountId === historyAccount?.id);

  const goToMonth = (month: string) =>
    setSearchParams(
      (params) => {
        if (month === currentMonth) params.delete(MONEY_MONTH_PARAM);
        else params.set(MONEY_MONTH_PARAM, month);
        return params;
      },
      { preventScrollReset: true },
    );

  const addAccount = (kind: "joint" | "savings", variant: "default" | "outline" = "outline") => (
    <AccountFormDialog
      habitants={habitants}
      today={data.today}
      defaultKind={kind}
      trigger={
        <Button variant={variant}>
          {kind === "savings" ? <PiggyBankIcon /> : <LandmarkIcon />}
          {kind === "savings" ? t("actions.addSavings") : t("actions.addJoint")}
        </Button>
      }
    />
  );
  const hasJoint = active.some((account) => account.kind === "joint");
  const hasSavings = active.some((account) => account.kind === "savings");
  // Missing accounts show as dashed placeholders in the account row, where they will appear.
  const placeholders = canManage && active.length > 0 ? ([!hasJoint && "joint", !hasSavings && "savings"].filter(Boolean) as ("joint" | "savings")[]) : [];

  return (
    <PageContainer>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          canManage && (
            <>
              {active.length > 0 && hasJoint && hasSavings && (
                <AccountFormDialog
                  habitants={habitants}
                  today={data.today}
                  trigger={
                    <Button variant="outline">
                      <PlusIcon />
                      {t("actions.addAccount")}
                    </Button>
                  }
                />
              )}
              {active.length > 0 && (
                <RecordTransferDialog
                  accounts={data.accounts}
                  habitants={habitants}
                  today={data.today}
                  trigger={
                    <Button>
                      <ArrowLeftRightIcon />
                      {t("actions.recordTransfer")}
                    </Button>
                  }
                />
              )}
            </>
          )
        }
      />

      {data.accounts.length === 0 && (
        <EmptyState
          icon={LandmarkIcon}
          title={t("setup.title")}
          description={t("setup.description")}
          action={
            canManage && (
              <div className="flex flex-wrap justify-center gap-2">
                {addAccount("joint", "default")}
                {addAccount("savings")}
              </div>
            )
          }
        />
      )}

      <div className="flex flex-col gap-6">
        <SectionNavigation label={t("tabs.label")} items={[
          { id: "overview", label: t("tabs.overview"), icon: ChartNoAxesCombinedIcon },
          { id: "contributions", label: t("tabs.contributions"), icon: UsersIcon },
          { id: "settlement", label: t("tabs.settlement"), icon: ScaleIcon },
          { id: "history", label: t("tabs.history"), icon: HistoryIcon },
        ].map((item) => ({ ...item, to: tabLink(item.id), current: tab === item.id }))} />
        {tab === "contributions" && <section>
          <ContributionHistory data={contributionHistory} accounts={data.accounts} plans={data.plans} habitants={habitants} />
        </section>}

        {tab !== "contributions" && (
          <PeriodNavigator
            label={monthLabel(data.month)}
            onPrevious={() => goToMonth(shift(data.month, -1))}
            onNext={() => goToMonth(shift(data.month, 1))}
            onToday={() => goToMonth(currentMonth)}
            previousLabel={t("month.previous")}
            nextLabel={t("month.next")}
            todayLabel={t("month.today")}
            isCurrent={data.month === currentMonth}
            pending={pending}
          />
        )}

        <PendingContent pending={pending} label={tCommon("loading.updating")} contentClassName="flex flex-col gap-6">
          {tab === "overview" && <section className="flex flex-col gap-6">
            {active.length > 0 && (
              <PageGrid as="section" columns={accountColumns(active.length + placeholders.length)} className="gap-4" aria-label={t("accounts.title")}>
                {active.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    activityTo={accountActivityLink(account.id)}
                    month={data.accountMonths.find((item) => item.accountId === account.id)}
                    accounts={data.accounts}
                    habitants={habitants}
                    today={data.today}
                    canManage={canManage}
                  />
                ))}
                {placeholders.map((kind) => (
                  <AddAccountCard key={kind} kind={kind} habitants={habitants} today={data.today} />
                ))}
              </PageGrid>
            )}

            <PageGrid columns="2" className="items-start">
              <IncomeFlowCard income={data.income} habitants={habitants} month={data.month} />
              <JointOutgoingsCard outgoings={data.jointOutgoings} today={data.today} />
            </PageGrid>

            {(timeline !== undefined || loans !== undefined) && (
              <PageGrid columns={timeline !== undefined && loans !== undefined ? "main-sidebar" : "1"} className="items-start">
                {timeline !== undefined && <MoneyTimelineCard data={timeline} className="min-w-0" />}
                {loans !== undefined && <LoansCard data={loans} className="min-w-0" />}
              </PageGrid>
            )}

            <PageGrid columns="3" className="items-start">
              {nextToPay}
              {vouchers}
              {projects ?? (
                <Card className="gap-2">
                  <MoneyCardHeader icon={FolderKanbanIcon} title={t("projects.title")} description={t("projects.placeholder")} />
                </Card>
              )}
            </PageGrid>

            {archived.length > 0 && (
              <PageGrid columns={accountColumns(archived.length)} className="gap-4">
                {archived.map((account) => (
                  <AccountCard key={account.id} activityTo={accountActivityLink(account.id)} account={account} accounts={data.accounts} habitants={habitants} today={data.today} canManage={canManage} />
                ))}
              </PageGrid>
            )}
          </section>}
          {tab === "settlement" && <section className="flex flex-col gap-6">
            {data.accounts.length > 0 && (
              <PageGrid columns="main-sidebar" className="items-start">
                <ContributionsCard
                  rows={data.contributions}
                  plans={data.plans}
                  accounts={data.accounts}
                  habitants={habitants}
                  month={data.month}
                  today={data.today}
                  canManage={canManage}
                />
                <CoverageCard
                  rows={data.contributions}
                  accounts={data.accounts}
                  accountMonths={data.accountMonths}
                  costs={data.jointCosts}
                  income={data.income.people}
                  habitants={habitants}
                  month={data.month}
                  today={data.today}
                  canManage={canManage}
                />
              </PageGrid>
            )}
          </section>}
          {tab === "history" && <section className="flex flex-col gap-6">
            {historyAccount && historyMonth && (
              <PageSection className="gap-4">
                <SectionHeader title={t("ledger.title")} description={monthLabel(data.month)} />
                {data.accounts.length > 1 && (
                  <ScrollRow label={t("ledger.label")} focusable={false}>
                    <SegmentedControl
                      label={t("ledger.label")}
                      value={historyAccount.id}
                      onChange={setHistoryAccountId}
                      options={data.accounts.map((account) => ({
                        value: account.id,
                        label: account.name,
                        icon: account.kind === "savings" ? PiggyBankIcon : LandmarkIcon,
                      }))}
                    />
                  </ScrollRow>
                )}
                <LedgerList lines={historyMonth.lines} accounts={data.accounts} habitants={habitants} canManage={canManage} />
              </PageSection>
            )}
          </section>}
        </PendingContent>
      </div>
    </PageContainer>
  );
}
