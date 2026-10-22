import { ArrowRightIcon, BanknoteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/shared/card";
import { HabitantAvatar, type Habitant } from "@/features/household";
import type { MoneyMonth } from "../types/money";
import { MoneyCardHeader } from "./money-card-header";
import { money, usePersonName } from "./use-money-text";

type IncomeFlowCardProps = {
  income: MoneyMonth["income"];
  habitants: Habitant[];
  month: string;
};

/** Income in this month per person (and joint): received vs still expected, and amounts still to enter. */
export function IncomeFlowCard({ income, habitants, month }: IncomeFlowCardProps) {
  const { t } = useTranslation("money");
  const personName = usePersonName(habitants);
  const order = (key: string) => (key === "joint" ? habitants.length : habitants.findIndex((habitant) => habitant.id === key));
  const rows = [...income.people].sort((a, b) => order(a.key) - order(b.key));
  const progress = (received: number, total: number) => (total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0);

  return (
    <Card className="min-w-0 gap-3">
      <MoneyCardHeader
        icon={BanknoteIcon}
        title={t("income.title")}
        actions={
          <Link to={`/income?month=${month}`} className="flex min-h-10 items-center gap-1 text-sm text-primary hover:underline">
            {t("actions.viewIncome")}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("income.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {[...rows, { key: "__household", ...income.household }].map((row) => {
            const habitant = habitants.find((item) => item.id === row.key);
            const household = row.key === "__household";
            return (
              <li key={row.key} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center gap-2">
                  {habitant && <HabitantAvatar habitant={habitant} size="sm" />}
                  <span className={household ? "flex-1 text-sm font-semibold" : "flex-1 text-sm font-medium"}>
                    {household ? t("income.household") : personName(row.key)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{money(row.totalCents)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress(row.receivedCents, row.totalCents)}%` }} />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{t("income.received", { amount: money(row.receivedCents) })}</span>
                  {row.expectedCents > 0 && <span>· {t("income.expected", { amount: money(row.expectedCents) })}</span>}
                  {row.toEnterCount > 0 && !household && (
                    <Badge variant="outline" className="ml-auto">
                      {t("income.toEnter", { count: row.toEnterCount })}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
