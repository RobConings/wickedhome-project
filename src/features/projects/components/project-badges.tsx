import { AlertTriangleIcon, CircleCheckIcon, TrendingUpIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectBudget } from "../types/project-budget";
import type { ProjectStatus } from "../types/projects";
import { useProjectText } from "./use-project-text";

/** In budget / at risk / over budget by how much. Nothing without a budget. */
export function ProjectBudgetBadge({ budget, className }: { budget: ProjectBudget; className?: string }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  if (budget.status === "no_budget") return null;
  const Icon = budget.status === "over_budget" ? TrendingUpIcon : budget.status === "at_risk" ? AlertTriangleIcon : CircleCheckIcon;
  return (
    <Badge
      variant={budget.status === "over_budget" ? "danger" : budget.status === "at_risk" ? "warning" : "success"}
      className={cn("gap-1 font-medium", className)}
    >
      <Icon aria-hidden="true" />
      {budget.status === "over_budget"
        ? t("budgetStatus.overBy", { amount: text.money(budget.overByCents) })
        : t(`budgetStatus.${budget.status}`)}
    </Badge>
  );
}

/** Planned, active, done or cancelled. */
export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const { t } = useTranslation("projects");
  return (
    <Badge
      variant={status === "active" ? "section" : status === "done" ? "success" : status === "planned" ? "info" : "neutral"}
      className={cn("font-medium", status === "cancelled" && "line-through", className)}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
