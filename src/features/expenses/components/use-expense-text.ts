import { useTranslation } from "react-i18next";
import { daysBetween } from "@/types/dates";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import { describeRecurrence } from "@/lib/recurrence-format";
import { formatDate } from "@/types/date-format";
import type { Expense } from "../types/expenses";
import type { TotalOpenPreview } from "../types/total-open";

/** Human text for an RRULE (shared wording): "Every 3 months", "Elke maand, tot 31/12/2027". */
export function useRecurrenceSummary() {
  const { t } = useTranslation("expenses");
  return (rrule: string | null | undefined): string | null => describeRecurrence(rrule, currentLocale(), t);
}

/** "Due in 3 days", "2 days overdue", "Paid 12/09/2026", or the due date when it's further away. */
export function useDueLabel() {
  const { t } = useTranslation("expenses");
  return (expense: Pick<Expense, "dueDate" | "paidOn" | "status">, today: string): string => {
    const locale = currentLocale();
    if (expense.paidOn) return t("row.paid", { date: formatDate(expense.paidOn, locale) });
    const days = daysBetween(today, expense.dueDate);
    if (days === 0) return t("row.dueToday");
    if (days < 0) return t("row.overdueDays", { count: -days });
    if (expense.status === "due") return t("row.dueInDays", { count: days });
    return t("row.due", { date: formatDate(expense.dueDate, locale) });
  };
}

/** "12 payments: 11 × € 853,17 + last € 615,13" or "10 payments of € 230,00" (a loan's total still open). */
export function useTotalOpenSummary() {
  const { t } = useTranslation("expenses");
  return (preview: TotalOpenPreview) => {
    const locale = currentLocale();
    return preview.partial && preview.count > 1
      ? t("totalOpen.summaryPartial", {
          count: preview.count,
          regular: preview.regularCount,
          amount: formatCurrency(preview.regularCents, locale),
          last: formatCurrency(preview.lastCents, locale),
        })
      : t("totalOpen.summaryEven", { count: preview.count, amount: formatCurrency(preview.partial ? preview.lastCents : preview.regularCents, locale) });
  };
}
