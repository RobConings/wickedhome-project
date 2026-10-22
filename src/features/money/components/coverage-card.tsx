import * as React from "react";
import { ScaleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { InlineAlert } from "@/components/shared/inline-alert";
import type { Habitant } from "@/features/household";
import type { FormResult } from "@/lib/forms";
import { cn } from "@/lib/utils";
import { contributionCoverage, personSettlement, type PlanSuggestion } from "../types/contribution-settlement";
import type { AccountMonth, ContributionRow, JointAccount, JointCosts, MoneyIncomeRow } from "../types/money";
import { MoneyCardHeader } from "./money-card-header";
import { usePersonName } from "./use-money-text";
import { useFetcherResult } from "@/lib/hooks/use-fetcher-result";
import { dateText, money } from "@/lib/locale-text";
import { useCanManage } from "@/lib/permissions";

type CoverageCardProps = {
  rows: ContributionRow[];
  accounts: JointAccount[];
  /** The accounts' month (their future-dated income lines raise the projected end-of-month balance). */
  accountMonths?: AccountMonth[];
  costs: JointCosts;
  /** The month's income per person (for the income-based suggestion). */
  income: MoneyIncomeRow[];
  habitants: Habitant[];
  month: string;
  today: string;
  /** Defaults to the nearest `CanManageProvider`. */
  canManage?: boolean;
  className?: string;
};

/**
 * Do the planned contributions cover this month's joint costs? Short: by how much, with new plan amounts
 * (same split as now, or by income) and "Update plans". This month also: the joint balance projected to the
 * end of the month, with a warning when it would go below zero.
 */
const NO_MONTHS: AccountMonth[] = [];

export function CoverageCard({ rows, accounts, accountMonths = NO_MONTHS, costs, income, habitants, month, today, canManage: canManageProp, className }: CoverageCardProps) {
  const canManage = useCanManage(canManageProp);
  const { t } = useTranslation("money");
  const { t: tCommon } = useTranslation();
  const personName = usePersonName(habitants);
  const fetcher = useFetcher<FormResult>();
  const joint = React.useMemo(() => accounts.filter((account) => account.kind === "joint" && !account.archived), [accounts]);
  const coverage = React.useMemo(
    () =>
      contributionCoverage({
        month,
        today,
        people: rows.filter((row) => joint.some((account) => account.id === row.accountId)).map(personSettlement),
        costs,
        balanceCents: joint.length > 0 ? joint.reduce((sum, account) => sum + account.balanceCents, 0) : null,
        incomes: income.filter((row) => row.key !== "joint").map((row) => ({ habitantId: row.key, cents: row.totalCents })),
        // Future-dated incomes on the joint current accounts: not in today's balance, but in the projection.
        incoming: accountMonths
          .filter((item) => joint.some((account) => account.id === item.accountId))
          .flatMap((item) => item.lines.filter((line) => line.type === "income" && line.future).map((line) => ({ date: line.date, amountCents: line.amountCents }))),
      }),
    [rows, joint, costs, income, accountMonths, month, today],
  );
  const monthStart = `${month}-01`;
  const canUpdate = canManage && month >= today.slice(0, 7);
  useFetcherResult(fetcher, (result) => {
    if (result.ok) toast.success(t("coverage.plansUpdated"));
    else toast.error(result.formError ?? tCommon("errors.generic"));
  });

  const update = (suggestions: PlanSuggestion[]) =>
    fetcher.submit(
      {
        intent: "update-plan-amounts",
        month,
        amounts: JSON.stringify(suggestions.map((item) => ({ planId: item.planId, amountCents: item.suggestedCents }))),
      },
      { method: "post" },
    );

  const result =
    coverage.status === "short"
      ? { text: t("coverage.short", { amount: money(-coverage.differenceCents) }), className: "text-danger" }
      : coverage.status === "left-over"
        ? { text: t("coverage.leftOver", { amount: money(coverage.differenceCents) }), className: "text-success" }
        : { text: t("coverage.covered"), className: "text-success" };
  const nothing = coverage.plannedCents === 0 && coverage.costsCents === 0;
  const projection = coverage.projection;

  return (
    <Card tone={nothing ? "default" : coverage.status === "short" ? "danger" : "success"} className={cn("min-w-0 gap-4", className)}>
      <MoneyCardHeader icon={ScaleIcon} title={t("coverage.title")} description={t("coverage.description")} />

      {nothing ? (
        <p className="text-sm text-muted-foreground">{t("coverage.noPlans")}</p>
      ) : (
        <>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{t("coverage.planned")}</dt>
              <dd className="font-semibold tabular-nums">{money(coverage.plannedCents)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("coverage.costs")}</dt>
                <dd className="font-semibold tabular-nums">{money(coverage.costsCents)}</dd>
              </div>
              <dd className="text-xs text-muted-foreground">{t("coverage.costsDetail", { paid: money(coverage.paidCents), toPay: money(coverage.toPayCents) })}</dd>
            </div>
          </dl>
          {coverage.plannedCents === 0 ? (
            <p className="text-sm text-muted-foreground">{t("coverage.noPlans")}</p>
          ) : (
            <p className={cn("text-base font-semibold", result.className)} role="status">
              {result.text}
            </p>
          )}
        </>
      )}

      {projection && (
        <div className="flex flex-col gap-1 border-t pt-3 text-sm">
          <span className="text-muted-foreground">{t("coverage.projectionTitle")}</span>
          <span className={cn("text-xl font-semibold tabular-nums", projection.endCents < 0 && "text-danger")}>{money(projection.endCents)}</span>
          <span className="text-xs text-muted-foreground">
            {t("coverage.projectionDetail", { balance: money(projection.balanceCents), receive: money(projection.toReceiveCents), pay: money(projection.toPayCents) })}
          </span>
          {projection.belowZeroOn && (
            <InlineAlert tone="warning" className="mt-2">
              {projection.belowZeroOn === today && projection.balanceCents < 0
                ? t("coverage.belowZeroNow")
                : t("coverage.belowZero", { date: dateText(projection.belowZeroOn), amount: money(projection.lowestCents) })}
            </InlineAlert>
          )}
        </div>
      )}

      {coverage.suggestions && (
        <div className="flex flex-col gap-3 border-t pt-3 text-sm">
          <span className="font-medium">{t("coverage.suggestTitle", { amount: money(coverage.costsCents) })}</span>
          {[
            { key: "plan", label: t("coverage.byPlan"), items: coverage.suggestions.byPlan },
            ...(coverage.suggestions.byIncome ? [{ key: "income", label: t("coverage.byIncome"), items: coverage.suggestions.byIncome }] : []),
          ].map((option) => (
            <div key={option.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <span className="text-xs font-medium text-muted-foreground">{option.label}</span>
              <ul className="flex flex-col gap-0.5">
                {option.items.map((item) => (
                  <li key={item.planId} className="tabular-nums break-words">
                    {t("coverage.suggestion", { name: personName(item.habitantId), from: money(item.currentCents), to: money(item.suggestedCents) })}
                  </li>
                ))}
              </ul>
              {canUpdate && (
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-10 whitespace-normal py-2 max-sm:w-full sm:self-start"
                    loading={fetcher.state !== "idle"}
                    onClick={() => update(option.items)}
                  >
                    {t("actions.updatePlans")}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t("coverage.updateHint", { date: dateText(monthStart) })}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
