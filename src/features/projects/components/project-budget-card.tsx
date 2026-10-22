import { InfoIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardTitle } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import type { ProjectBudget } from "../types/project-budget";
import { ProjectBudgetBadge } from "./project-badges";
import { ProjectBudgetBar } from "./project-budget-bar";
import { useProjectText } from "./use-project-text";

/** The budget of a project in full: budget, spent, committed, remaining (or over by), and where it comes from. */
export function ProjectBudgetCard({ budget, className }: { budget: ProjectBudget; className?: string }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const { breakdown } = budget;

  const row = (label: string, cents: number, detail?: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className={cn(strong ? "font-medium" : "text-muted-foreground")}>{label}</span>
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      </span>
      <span className={cn("shrink-0 tabular-nums", strong && "font-semibold")}>{text.money(cents)}</span>
    </div>
  );

  return (
    <Card className={cn("gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("budget.title")}</CardTitle>
        <ProjectBudgetBadge budget={budget} />
      </div>

      {budget.budgetCents !== null && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{t("budget.label")}</span>
          <span className="text-2xl font-semibold tabular-nums">{text.money(budget.budgetCents)}</span>
        </div>
      )}
      <ProjectBudgetBar budget={budget} showLegend={false} />

      <div className="flex flex-col gap-2.5 text-sm">
        {row(
          t("budget.spent"),
          budget.spentCents,
          t("budget.spentDetail", { expenses: text.money(breakdown.expensesPaidCents), materials: text.money(breakdown.materialsBoughtCents) }),
        )}
        {row(
          t("budget.committed"),
          budget.committedCents,
          t("budget.committedDetail", { expenses: text.money(breakdown.expensesUnpaidCents), materials: text.money(breakdown.materialsOpenCents) }),
        )}
        <div className="border-t pt-2.5">
          {budget.remainingCents === null ? (
            row(t("budget.total"), budget.spentCents + budget.committedCents, t("budget.noBudgetHint"), true)
          ) : budget.remainingCents < 0 ? (
            <div className="flex items-baseline justify-between gap-3 text-destructive">
              <span className="font-medium">{t("budget.over")}</span>
              <span className="font-semibold tabular-nums">{text.money(-budget.remainingCents)}</span>
            </div>
          ) : (
            row(t("budget.remaining"), budget.remainingCents, undefined, true)
          )}
        </div>
      </div>

      {budget.unpricedMaterials > 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("budget.unpriced", { count: budget.unpricedMaterials })}
        </p>
      )}
    </Card>
  );
}
