import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { budgetBarSegments, type ProjectBudget } from "../types/project-budget";
import { useProjectText } from "./use-project-text";

type ProjectBudgetBarProps = {
  budget: ProjectBudget;
  /** Also print spent / committed / remaining under the bar. */
  showLegend?: boolean;
  className?: string;
};

const SEGMENT_TONE: Record<ProjectBudget["status"], string> = {
  no_budget: "bg-section",
  in_budget: "bg-success",
  at_risk: "bg-warning",
  over_budget: "bg-danger",
};

/**
 * Spent (solid) and committed (striped) against the budget. Over budget the bar fills up and turns red. Every
 * figure is printed in the legend, so nothing depends on colour.
 */
export function ProjectBudgetBar({ budget, showLegend = true, className }: ProjectBudgetBarProps) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const segments = budgetBarSegments(budget);
  const tone = SEGMENT_TONE[budget.status];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          budget.budgetCents === null
            ? t("budget.ariaNoBudget", { spent: text.money(budget.spentCents), committed: text.money(budget.committedCents) })
            : t("budget.aria", {
                spent: text.money(budget.spentCents),
                committed: text.money(budget.committedCents),
                budget: text.money(budget.budgetCents),
              })
        }
      >
        <div className={cn("h-full", tone)} style={{ width: `${segments.spent}%` }} />
        <div
          className={cn("h-full opacity-60", tone)}
          style={{
            width: `${segments.committed}%`,
            backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.45) 3px 6px)",
          }}
        />
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <span>
            {t("budget.spentShort", { amount: text.money(budget.spentCents) })}
            {budget.committedCents > 0 && <> · {t("budget.committedShort", { amount: text.money(budget.committedCents) })}</>}
          </span>
          {budget.remainingCents !== null && (
            <span className={cn(budget.remainingCents < 0 && "font-medium text-destructive")}>
              {budget.remainingCents < 0
                ? t("budget.overShort", { amount: text.money(-budget.remainingCents) })
                : t("budget.leftShort", { amount: text.money(budget.remainingCents) })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
