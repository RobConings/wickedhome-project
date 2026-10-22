import type * as React from "react";
import { CircleCheckBigIcon, ShoppingCartIcon, WalletIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageGrid } from "./page-grid";
import { StatTile } from "./stat-tile";
import type { ExpensesSummary } from "@/features/expenses";
import type { ShoppingSummary } from "@/features/shopping";
import type { TasksSummary } from "@/features/tasks";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import { expensesDueThisWeek } from "../data/dashboard-items";

type DashboardStatsProps = {
  tasks: TasksSummary | null;
  shopping: ShoppingSummary | null;
  expenses: ExpensesSummary | null;
  /**
   * The fourth card, filled by the route (Devices' house status). Nothing is shown when it's omitted.
   */
  homeStatus?: React.ReactNode;
};

const unavailable = "–";

/** Key figures: today's tasks done (of all due today and overdue), items to buy, expenses due this week, and the home status from the route. */
export function DashboardStats({ tasks, shopping, expenses, homeStatus }: DashboardStatsProps) {
  const { t } = useTranslation("dashboard");
  const locale = currentLocale();
  const due = expenses ? expensesDueThisWeek(expenses) : null;

  return (
    // One tile per row on phones (full width, stacked), two from `sm`, four from `lg`.
    <PageGrid as="section" columns="stats-4" aria-label={t("stats.label")}>
      <StatTile
        label={t("stats.tasks.label")}
        // Same counts as the tasks page: done today of (done today + overdue + due today).
        value={tasks ? `${tasks.doneToday}/${tasks.doneToday + tasks.overdue + tasks.dueToday}` : unavailable}
        hint={
          tasks
            ? tasks.overdue + tasks.dueToday === 0
              ? t("stats.tasks.allDone")
              : tasks.overdue > 0
                ? t("stats.tasks.overdue", { count: tasks.overdue })
                : t("stats.tasks.hint")
            : t("loadError")
        }
        tone={tasks && tasks.overdue > 0 ? "warning" : tasks && tasks.overdue + tasks.dueToday === 0 ? "positive" : "default"}
        icon={CircleCheckBigIcon}
        iconTone="tasks"
        to="/tasks"
      />
      <StatTile
        label={t("stats.shopping.label")}
        value={shopping ? shopping.open : unavailable}
        hint={
          shopping
            ? shopping.open > 0
              ? t("stats.shopping.hint", { count: shopping.open })
              : t("stats.shopping.nothing")
            : t("loadError")
        }
        icon={ShoppingCartIcon}
        iconTone="shopping"
        to="/shopping"
      />
      <StatTile
        label={t("stats.bills.label")}
        value={due ? due.count : unavailable}
        hint={
          due
            ? [
                due.count > 0 ? t("stats.bills.amount", { amount: formatCurrency(due.totalCents, locale) }) : t("stats.bills.hint"),
                due.overdue > 0 && t("stats.bills.overdue", { count: due.overdue }),
                due.recurringMonthlyCents > 0 &&
                  t("stats.bills.recurring", { amount: formatCurrency(due.recurringMonthlyCents, locale) }),
              ]
                .filter(Boolean)
                .join(" · ")
            : t("loadError")
        }
        tone={due && due.overdue > 0 ? "negative" : due && due.count > 0 ? "highlight" : "default"}
        icon={WalletIcon}
        iconTone="finance"
        to="/expenses"
      />
      {homeStatus}
    </PageGrid>
  );
}
