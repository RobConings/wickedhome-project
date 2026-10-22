import * as React from "react";
import { ReceiptIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { GeneralList } from "./general-list";
import type { Habitant } from "@/features/household";
import { ShopLogo, type Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { formatMonth } from "@/types/date-format";
import { monthOf } from "@/types/dates";
import type { Expense } from "../types/expenses";
import { ExpenseRow } from "./expense-row";

type ExpenseListProps = {
  expenses: Expense[];
  today: string;
  habitants: Habitant[];
  shops?: Shop[];
  canManage: boolean;
  currentHabitantId?: string | null;
  /** Show this many month groups, with a button for the rest (a search looks in all). Omit to show everything. */
  initialMonths?: number;
  /** "On hold" reasons by expense id (from linked tasks), passed in by the route. */
  onHoldById?: Record<string, string>;
  /** Remembers list/tiles per list (e.g. "expenses-upcoming"). */
  storageKey?: string;
  /** Filters under the search field (e.g. who pays). */
  toolbar?: React.ReactNode;
  /** A toolbar filter is active (nothing left then shows `noMatchesState`). */
  filtered?: boolean;
  /** Nothing to show at all. */
  emptyState?: React.ReactNode;
  /** The filters (not the search) leave nothing. */
  noMatchesState?: React.ReactNode;
  /** Reloading: keeps showing the list, faded. */
  pending?: boolean;
};

const monthKey = (expense: Expense) => monthOf(expense.paidOn ?? expense.dueDate);

/**
 * Expenses as a `GeneralList` (search, list/tiles), grouped per month (by due date, or payment date once
 * paid), each month with its total.
 */
export function ExpenseList({
  expenses,
  today,
  habitants,
  shops = [],
  canManage,
  currentHabitantId,
  initialMonths,
  onHoldById,
  storageKey = "expenses",
  toolbar,
  filtered = false,
  emptyState,
  noMatchesState,
  pending = false,
}: ExpenseListProps) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  const [showAll, setShowAll] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const shopById = React.useMemo(() => new Map(shops.map((shop) => [shop.id, shop])), [shops]);
  const habitantById = React.useMemo(() => new Map(habitants.map((habitant) => [habitant.id, habitant])), [habitants]);

  const months = [...new Set(expenses.map(monthKey))];
  // A search looks in every month; otherwise the first months, with a button for the rest.
  const limit = initialMonths && !showAll && !query.trim() ? initialMonths : null;
  const shownMonths = limit ? new Set(months.slice(0, limit)) : null;
  const visible = shownMonths ? expenses.filter((expense) => shownMonths.has(monthKey(expense))) : expenses;
  const hiddenMonths = shownMonths ? months.length - shownMonths.size : 0;

  const rowProps = (expense: Expense) => {
    const shop = expense.shopId ? shopById.get(expense.shopId) : undefined;
    return {
      expense,
      today,
      habitants,
      canManage,
      currentHabitantId,
      leading: shop ? <ShopLogo shop={shop} size="md" /> : undefined,
      onHold: onHoldById?.[expense.id],
    };
  };

  return (
    <div className="flex flex-col gap-6">
      <GeneralList<Expense>
        label={t("page.title")}
        items={visible}
        getKey={(expense) => expense.id}
        renderRow={(expense) => <ExpenseRow variant="plain" {...rowProps(expense)} />}
        renderTile={(expense) => <ExpenseRow variant="tile" {...rowProps(expense)} />}
        search={{
          query,
          onSearch: setQuery,
          keys: (expense) => [
            expense.payee,
            expense.description,
            expense.notes,
            t(`categories.${expense.category}`),
            expense.project?.name,
            expense.shopId ? shopById.get(expense.shopId)?.name : null,
            expense.payerHabitantId ? habitantById.get(expense.payerHabitantId)?.name : null,
            ...expense.shares.map((share) => habitantById.get(share.habitantId)?.name),
          ],
        }}
        storageKey={storageKey}
        defaultView="list"
        toolbar={toolbar}
        filtered={filtered}
        pending={pending}
        emptyState={emptyState ?? <EmptyState icon={ReceiptIcon} title={t("empty.upcoming.title")} description={t("empty.upcoming.description")} />}
        noResultsState={query.trim() ? undefined : noMatchesState}
        groupBy={monthKey}
        renderGroupHeader={(month) => (
          <span className="capitalize">{formatMonth(month, locale)}</span>
        )}
        renderGroupActions={(_month, items) => (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatCurrency(
              items.reduce((sum, expense) => sum + expense.amountCents, 0),
              locale,
            )}
          </span>
        )}
      />
      {hiddenMonths > 0 && (
        <Button variant="outline" className="self-center" onClick={() => setShowAll(true)}>
          {t("actions.showMore", { count: hiddenMonths })}
        </Button>
      )}
    </div>
  );
}
