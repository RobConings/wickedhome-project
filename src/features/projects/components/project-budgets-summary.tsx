import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import { Inline } from "@/components/layout/inline";
import * as React from "react";
import { ArrowRightIcon, FolderKanbanIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingContent } from "@/components/shared/loading-state";
import { fetchProjectBudgetsSummary } from "../data/projects-requests";
import { projectPath, type ProjectBudgetsSummaryData } from "../types/projects";
import { ProjectBudgetBadge } from "./project-badges";
import { ProjectBudgetBar } from "./project-budget-bar";
import { ProjectAvatar } from "./project-icon";
import { useProjectText } from "./use-project-text";

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
      <Stack gap="3"  role="status" aria-label={t("summary.loading")}>
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </Stack>
    );
  }
  if (state.status === "error") {
    return (
      <Stack gap="sm" align="start" className="text-sm text-muted-foreground">
        {t("summary.error")}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFetched({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          {tCommon("actions.retry")}
        </Button>
      </Stack>
    );
  }

  const { projects, totals } = state.data;
  if (projects.length === 0) {
    return (
      <Stack gap="sm" align="start" className="text-sm text-muted-foreground">
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
      </Stack>
    );
  }

  return (
    <PendingContent pending={refreshing} label={tCommon("loading.updating")}>
      <Stack gap="md">
        <Text size="sm" tone="muted" className="tabular-nums">
          {t("summary.totals", { paid: text.money(totals.spentInMonthCents), due: text.money(totals.dueInMonthCents) })}
          {totals.overBudget > 0 && <> · <span className="font-medium text-destructive">{t("summary.overBudget", { count: totals.overBudget })}</span></>}
          {totals.atRisk > 0 && <> · <span className="font-medium text-warning">{t("summary.atRisk", { count: totals.atRisk })}</span></>}
        </Text>
        <ul className="flex flex-col gap-3">
          {projects.map(({ project, budget, spentInMonthCents, dueInMonthCents }) => (
            <li key={project.id} className="relative flex items-start gap-3">
              <ProjectAvatar project={project} size="sm" />
              <Stack gap="1.5" className="min-w-0 flex-1">
                <Inline gap="none" align="center" justify="between" wrap className="gap-x-2 gap-y-1">
                  <Link to={projectPath(project.id)} className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline">
                    {project.name}
                  </Link>
                  <ProjectBudgetBadge budget={budget} />
                </Inline>
                {budget.budgetCents !== null && <ProjectBudgetBar budget={budget} />}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("summary.month", { paid: text.money(spentInMonthCents), due: text.money(dueInMonthCents) })}
                </span>
              </Stack>
            </li>
          ))}
        </ul>
      </Stack>
    </PendingContent>
  );
}
