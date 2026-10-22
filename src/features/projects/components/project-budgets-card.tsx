import * as React from "react";
import { FolderKanbanIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardTitle } from "@/components/shared/card";
import type { ProjectBudgetsSummaryData } from "../types/projects";
import { ProjectBudgetsSummary } from "./project-budgets-summary";
import { DeferredContent } from "@/components/shared/deferred-content";

type ProjectBudgetsCardProps = {
  /**
   * The month's project budgets: data, or a deferred promise from the route's loader (resolving to `null` when
   * it failed: the card then says so). Left out, the card loads them itself for `month`.
   */
  data?: ProjectBudgetsSummaryData | Promise<ProjectBudgetsSummaryData | null> | null;
  /** `YYYY-MM`; this month when left out. */
  month?: string;
};

/** "Projects" card for the money flow page: the running projects of the month and their budget status. */
export function ProjectBudgetsCard({ data, month }: ProjectBudgetsCardProps) {
  const { t } = useTranslation("projects");
  const failed = <p className="text-sm text-muted-foreground">{t("summary.error")}</p>;
  const content = (
    <DeferredContent
      data={data}
      failed={failed}
      fallback={
        <div className="flex flex-col gap-3" role="status" aria-label={t("summary.loading")}>
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      }
    >
      {(value, deferred) => <ProjectBudgetsSummary data={value} month={deferred ? undefined : month} />}
    </DeferredContent>
  );

  return (
    <Card className="gap-3">
      <div className="flex items-center gap-2">
        <FolderKanbanIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <CardTitle>
          <Link to="/projects" className="hover:underline">
            {t("page.title")}
          </Link>
        </CardTitle>
      </div>
      {content}
    </Card>
  );
}
