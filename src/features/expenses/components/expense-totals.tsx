import { AlertTriangleIcon, CalendarClockIcon, CalendarIcon, PiggyBankIcon, RepeatIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatTile } from "@/components/shared/stat-tile";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { ExpensePeriodTotal, ExpenseTotals as ExpenseTotalsData, RecurringTotals as RecurringTotalsData } from "../types/expenses";

/** This month, next month and overdue, side by side. */
export function ExpenseTotals({ totals }: { totals: ExpenseTotalsData }) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();

  const periodHint = (period: ExpensePeriodTotal) =>
    period.count === 0
      ? t("totals.none")
      : period.unpaidCents === 0
        ? t("totals.allPaid", { count: period.count })
        : t("totals.unpaid", { amount: formatCurrency(period.unpaidCents, locale) });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile
        label={t("totals.thisMonth")}
        value={formatCurrency(totals.thisMonth.totalCents, locale)}
        hint={periodHint(totals.thisMonth)}
        icon={CalendarIcon}
        tone="featured"
      />
      <StatTile
        label={t("totals.nextMonth")}
        value={formatCurrency(totals.nextMonth.totalCents, locale)}
        hint={periodHint(totals.nextMonth)}
        icon={CalendarClockIcon}
        tone="info"
      />
      <StatTile
        label={t("totals.overdue")}
        value={formatCurrency(totals.overdue.totalCents, locale)}
        hint={totals.overdue.count === 0 ? t("totals.nothingOverdue") : t("totals.count", { count: totals.overdue.count })}
        icon={AlertTriangleIcon}
        tone={totals.overdue.count > 0 ? "negative" : "positive"}
      />
    </div>
  );
}

/** What everything recurring costs per month and per year, and what cancelling the candidates saves. */
export function RecurringTotals({ totals }: { totals: RecurringTotalsData }) {
  const { t } = useTranslation("expenses");
  const locale = currentLocale();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatTile
        label={t("totals.perMonth")}
        value={formatCurrency(totals.monthlyCents, locale)}
        hint={t("totals.active", { count: totals.activeCount })}
        icon={CalendarIcon}
        tone="featured"
      />
      <StatTile
        label={t("totals.perYear")}
        value={formatCurrency(totals.yearlyCents, locale)}
        hint={t("totals.normalised")}
        icon={RepeatIcon}
      />
      <StatTile
        label={t("totals.savings")}
        value={formatCurrency(totals.candidatesYearlyCents, locale)}
        hint={totals.candidatesCount === 0 ? t("totals.noCandidates") : t("totals.candidates", { count: totals.candidatesCount })}
        icon={PiggyBankIcon}
        tone={totals.candidatesCount > 0 ? "positive" : "default"}
      />
    </div>
  );
}
