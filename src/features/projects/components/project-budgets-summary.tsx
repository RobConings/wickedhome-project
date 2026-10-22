import * as React from "react";
import { ArrowRightIcon, FolderKanbanIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingContent } from "@/components/shared/loading-state";
import { fetchProjectBudgetsSummary } from "../data/projects-requests";
import { projectPath, type ProjectBudgetsSummaryData } from "../types/projects";
import { ProjectBudgetBadge } from "./project-badges";
import { ProjectBudgetBar } from "./project-budget-bar";
import { ProjectAvatar } from "./project-icon";
import { useProjectText } from "./use-project-text";
import { InlineRetry } from "@/components/shared/inline-retry";

type ProjectBudgetsSummaryProps = {
  /** `YYYY-MM`; this month when left out. */
  month?: string;
  /** Data instead of fetching it (stories, or a loader that already has it). */
  data?: ProjectBudgetsSummaryData;
};

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: ProjectBudgetsSummaryData };

/**
 * Project budgets for the money flow page: running projects in the month with their budget bar and status,
 * what was paid for them in the month and what is due. Loads its own data (`fetchProjectBudgetsSummary`), so the
 * money flow route only renders `<ProjectBudgetsSummary month={month} />`. Content only: the page draws the card.
 */
export function ProjectBudgetsSummary({ month, data }: ProjectBudgetsSummaryProps) {
  const { t } = useTranslation("projects");
  const { t: tCommon } = useTranslation();
  const text = useProjectText();
  const [fetched, setFetched] = React.useState<State>({ status: "loading" });
  // The month being fetched (the old month's figures stay, faded, until the new ones are in).
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const key = `${month ?? ""}:${attempt}`;

  React.useEffect(() => {
    if (data) return;
    let cancelled = false;
    fetchProjectBudgetsSummary(month)
      .then((result) => !cancelled && setFetched({ status: "ready", data: result }))
      .catch(() => !cancelled && setFetched((previous) => (previous.status === "ready" ? previous : { status: "error" })))
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [month, data, key]);

  const state: State = data ? { status: "ready", data } : fetched;
  const refreshing = !data && fetched.status === "ready" && loadedKey !== key;

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={t("summary.loading")}>
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <InlineRetry
        message={t("summary.error")}
        onRetry={() => {
          setFetched({ status: "loading" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  const { projects, totals } = state.data;
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <FolderKanbanIcon className="size-4" aria-hidden="true" />
          {t("summary.empty")}
        </span>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/projects">
            {t("summary.open")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground tabular-nums">
          {t("summary.totals", { paid: text.money(totals.spentInMonthCents), due: text.money(totals.dueInMonthCents) })}
          {totals.overBudget > 0 && <> · <span className="font-medium text-destructive">{t("summary.overBudget", { count: totals.overBudget })}</span></>}
          {totals.atRisk > 0 && <> · <span className="font-medium text-warning">{t("summary.atRisk", { count: totals.atRisk })}</span></>}
        </p>
        <ul className="flex flex-col gap-3">
          {projects.map(({ project, budget, spentInMonthCents, dueInMonthCents }) => (
            <li key={project.id} className="relative flex items-start gap-3">
              <ProjectAvatar project={project} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <Link to={projectPath(project.id)} className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline">
                    {project.name}
                  </Link>
                  <ProjectBudgetBadge budget={budget} />
                </div>
                {budget.budgetCents !== null && <ProjectBudgetBar budget={budget} />}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("summary.month", { paid: text.money(spentInMonthCents), due: text.money(dueInMonthCents) })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PendingContent>
  );
}
