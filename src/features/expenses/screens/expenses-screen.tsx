import * as React from "react";
import {
  CircleCheckIcon,
  HistoryIcon,
  ListTodoIcon,
  PlusIcon,
  ReceiptIcon,
  RepeatIcon,
  ShoppingBasketIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigation, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer } from "@/components/layout/page-container";
import { EmptyState } from "@/components/shared/empty-state";
import { GeneralList } from "@/components/shared/general-list";
import { PendingContent } from "@/components/shared/loading-state";
import { PageHeader } from "@/components/shared/page-header";
import { SegmentedControl } from "@/components/shared/segmented-control";
import type { Habitant } from "@/features/household";
import type { Shop } from "@/features/shops";
import { useOpenRequestFromUrl } from "@/lib/open-from-url";
import { useSamePagePending } from "@/lib/pending";
import { ExpenseFormDialog, type ExpenseProjectField } from "../components/expense-form-dialog";
import { ExpenseList } from "../components/expense-list";
import { ExpenseTotals, RecurringTotals } from "../components/expense-totals";
import { LogExpenseDialog } from "../components/log-expense-dialog";
import { NextToPay } from "../components/next-to-pay";
import { RecurringExpenseRow } from "../components/recurring-expense-row";
import {
  EXPENSES_KIND_PARAM,
  EXPENSES_PAYER_PARAM,
  EXPENSES_STATUS_PARAM,
  EXPENSES_VIEW_PARAM,
} from "../data/expenses-loaders";
import { matchesPayer, type PayerFilter } from "../types/expense-calculations";
import {
  EXPENSE_KINDS,
  RECURRING_STATUSES,
  type ExpenseKind,
  type ExpensesOverview,
  type RecurringExpense,
  type RecurringStatus,
} from "../types/expenses";

const VIEWS = ["upcoming", "recurring", "history"] as const;
type View = (typeof VIEWS)[number];
const ALL = "all";

type ExpensesScreenProps = {
  overview: ExpensesOverview;
  habitants: Habitant[];
  shops?: Shop[];
  /** Adults and owners manage expenses; children only look. */
  canManage: boolean;
  /** The logged-in user's habitant, pre-selected as payer. */
  currentHabitantId?: string | null;
  /** "On hold" reasons by expense id (from linked pay tasks), passed in by the route. */
  onHoldById?: Record<string, string>;
  /** Optional "Project" field in the forms, composed by the route. */
  projectField?: ExpenseProjectField;
  /** Suggested expenses from elsewhere (e.g. bills found in mail), composed by the route; shown on top of Upcoming. */
  suggestions?: React.ReactNode;
};

/**
 * Expenses: Upcoming (unpaid, soonest first, per payer), Recurring (everything running, with its cost per
 * month and year) and History (paid). Views and filters live in the URL and only filter loaded data.
 */
export function ExpensesScreen({ overview, habitants, shops = [], canManage, currentHabitantId, onHoldById, projectField, suggestions }: ExpensesScreenProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigation = useNavigation();
  const pending = useSamePagePending();
  const [recurringQuery, setRecurringQuery] = React.useState("");
  // Show the clicked view/filter right away: it only filters what is here, even while the page navigates.
  const nextLocation = navigation.location?.pathname === location.pathname ? navigation.location : undefined;
  const params = nextLocation ? new URLSearchParams(nextLocation.search) : searchParams;
  const requestedView = params.get(EXPENSES_VIEW_PARAM);
  const view: View = (VIEWS as readonly string[]).includes(requestedView ?? "") ? (requestedView as View) : "upcoming";
  const payerParam = params.get(EXPENSES_PAYER_PARAM) ?? ALL;
  const payerFilter: PayerFilter = payerParam === ALL ? "all" : payerParam === "joint" ? "joint" : { habitantId: payerParam };
  const kindParam = params.get(EXPENSES_KIND_PARAM);
  const kind = (EXPENSE_KINDS as readonly string[]).includes(kindParam ?? "") ? (kindParam as ExpenseKind) : null;
  const statusParam = params.get(EXPENSES_STATUS_PARAM);
  const status = (RECURRING_STATUSES as readonly string[]).includes(statusParam ?? "") ? (statusParam as RecurringStatus) : null;

  const setParam = (name: string, value: string | null) =>
    setSearchParams(
      (current) => {
        if (value === null) current.delete(name);
        else current.set(name, value);
        return current;
      },
      { replace: true, preventScrollReset: true },
    );

  const unpaid = overview.expenses.filter((expense) => expense.status !== "paid");
  const lists = {
    upcoming: unpaid.filter((expense) => matchesPayer(expense, payerFilter)),
    history: overview.expenses
      .filter((expense) => expense.status === "paid" && matchesPayer(expense, payerFilter))
      .sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? "")),
  };
  const recurring = overview.recurring
    .filter((item) => (kind ? item.kind === kind : true))
    // Default: what is running (active and paused); "ended" only when asked for.
    .filter((item) => (status ? item.status === status : item.status !== "ended"))
    .sort(
      (a, b) =>
        (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999") || a.payee.localeCompare(b.payee),
    );
  const overdueCount = unpaid.filter((expense) => expense.status === "overdue").length;

  // Quick actions: `?new=1` opens the expense form, `?log=1` the fast "Log an expense" dialog; the param is
  // removed. Each request mounts a fresh, open dialog (a new key), also when this page is already showing.
  const newRequest = useOpenRequestFromUrl(canManage);
  const logRequest = useOpenRequestFromUrl(canManage, "log");
  const payers = habitants.filter((habitant) => habitant.type !== "pet");
  const payerOptions = [
    { value: ALL, label: t("filters.all") },
    { value: "joint", label: t("filters.joint") },
    ...payers.map((habitant) => ({ value: habitant.id, label: habitant.name })),
  ];

  const addButton = (request: string | null = null) =>
    canManage && (
      <ExpenseFormDialog
        key={request ?? "idle"}
        habitants={habitants}
        shops={shops}
        payees={overview.payees}
        today={overview.today}
        defaultOpen={request !== null}
        projectField={projectField}
        trigger={
          <Button variant="outline">
            <PlusIcon />
            {t("actions.add")}
          </Button>
        }
      />
    );
  const logButton = (request: string | null = null) =>
    canManage && (
      <LogExpenseDialog
        key={request ?? "idle"}
        habitants={habitants}
        shops={shops}
        today={overview.today}
        defaultOpen={request !== null}
        projectField={projectField}
        trigger={
          <Button>
            <ShoppingBasketIcon />
            {t("actions.log")}
          </Button>
        }
      />
    );

  // Who pays: one row that scrolls inside itself on phones (SegmentedControl is a ScrollRow).
  const payerFilterControl = (
    <SegmentedControl
      label={t("filters.payer")}
      value={payerParam}
      onChange={(value) => setParam(EXPENSES_PAYER_PARAM, value === ALL ? null : value)}
      options={payerOptions}
    />
  );
  /** The filters leave nothing (a search that finds nothing gets the lists' standard state). */
  const filteredEmpty = (icon: LucideIcon) => (
    <EmptyState icon={icon} title={t("empty.filtered.title")} description={t("empty.filtered.description")} />
  );

  return (
    <PageContainer>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            {logButton(logRequest)}
            {addButton(newRequest)}
          </>
        }
      />

      <div className="flex min-w-0 items-center gap-2">
        <SegmentedControl
          label={t("views.label")}
          size="lg"
          value={view}
          onChange={(value) => setParam(EXPENSES_VIEW_PARAM, value === "upcoming" ? null : value)}
          options={[
            { value: "upcoming", label: t("views.upcoming"), icon: ListTodoIcon },
            { value: "recurring", label: t("views.recurring"), icon: RepeatIcon },
            { value: "history", label: t("views.history"), icon: HistoryIcon },
          ]}
        />
        {overdueCount > 0 && view !== "upcoming" && (
          <Badge variant="destructive" className="shrink-0 tabular-nums">
            {overdueCount}
          </Badge>
        )}
      </div>

      <PendingContent pending={pending} label={tCommon("loading.updating")}>
        {view === "upcoming" && (
          <div className="flex flex-col gap-6">
            {suggestions}
            <ExpenseTotals totals={overview.totals} />
            {payerFilter === "all" && unpaid.length > 0 && (
              <NextToPay unpaid={unpaid} habitants={habitants} today={overview.today} />
            )}
            <ExpenseList
              expenses={lists.upcoming}
              today={overview.today}
              habitants={habitants}
              shops={shops}
              canManage={canManage}
              currentHabitantId={currentHabitantId}
              initialMonths={3}
              onHoldById={onHoldById}
              storageKey="expenses-upcoming"
              toolbar={payerFilterControl}
              filtered={payerFilter !== "all"}
              emptyState={
                <EmptyState icon={ReceiptIcon} title={t("empty.upcoming.title")} description={t("empty.upcoming.description")} action={addButton()} />
              }
              noMatchesState={filteredEmpty(CircleCheckIcon)}
            />
          </div>
        )}

        {view === "recurring" && (
          <div className="flex flex-col gap-6">
            <RecurringTotals totals={overview.recurringTotals} />
            <GeneralList<RecurringExpense>
              label={t("views.recurring")}
              items={recurring}
              getKey={(item) => item.id}
              renderRow={(item) => (
                <RecurringExpenseRow variant="plain" recurring={item} today={overview.today} habitants={habitants} canManage={canManage} />
              )}
              renderTile={(item) => (
                <RecurringExpenseRow variant="tile" recurring={item} today={overview.today} habitants={habitants} canManage={canManage} />
              )}
              search={{
                query: recurringQuery,
                onSearch: setRecurringQuery,
                keys: (item) => [item.payee, item.description, item.notes, t(`kinds.${item.kind}`), t(`categories.${item.category}`), item.project?.name],
              }}
              storageKey="expenses-recurring"
              defaultView="list"
              // With any recurring expense at all, an empty list means the kind/status filters hide them.
              filtered={overview.recurring.length > 0}
              toolbar={
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Select value={kind ?? ALL} onValueChange={(value) => setParam(EXPENSES_KIND_PARAM, value === ALL ? null : value)}>
                    <SelectTrigger className="w-full sm:w-48" aria-label={t("filters.kind")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("filters.allKinds")}</SelectItem>
                      {EXPENSE_KINDS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`kinds.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={status ?? ALL} onValueChange={(value) => setParam(EXPENSES_STATUS_PARAM, value === ALL ? null : value)}>
                    <SelectTrigger className="w-full sm:w-40" aria-label={t("filters.status")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>
                        {t("recurringStatus.active")} + {t("recurringStatus.paused")}
                      </SelectItem>
                      {RECURRING_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`recurringStatus.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
              emptyState={
                <EmptyState icon={RepeatIcon} title={t("empty.recurring.title")} description={t("empty.recurring.description")} action={addButton()} />
              }
              noResultsState={recurringQuery.trim() ? undefined : filteredEmpty(RepeatIcon)}
            />
          </div>
        )}

        {view === "history" && (
          <ExpenseList
            expenses={lists.history}
            today={overview.today}
            habitants={habitants}
            shops={shops}
            canManage={canManage}
            currentHabitantId={currentHabitantId}
            initialMonths={6}
            storageKey="expenses-history"
            toolbar={payerFilterControl}
            filtered={payerFilter !== "all"}
            emptyState={<EmptyState icon={HistoryIcon} title={t("empty.history.title")} description={t("empty.history.description")} action={logButton()} />}
            noMatchesState={filteredEmpty(HistoryIcon)}
          />
        )}
      </PendingContent>
    </PageContainer>
  );
}
