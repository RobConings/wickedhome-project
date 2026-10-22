import { CalendarIcon, ListChecksIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card } from "./card";
import { documentContentUrl } from "@/features/documents";
import { cn } from "@/lib/utils";
import { projectPath, type Project } from "../types/projects";
import { ProjectBudgetBadge, ProjectStatusBadge } from "./project-badges";
import { ProjectBudgetBar } from "./project-budget-bar";
import { ProjectAvatar } from "./project-icon";
import { useProjectText } from "./use-project-text";

/** One project as a tile: cover or icon, name, tag, dates, budget bar and task progress. */
export function ProjectTile({ project }: { project: Project }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const period = text.period(project);
  const closed = project.status === "done" || project.status === "cancelled";

  return (
    <Card className={cn("relative gap-3 overflow-hidden p-0 has-[a:hover]:bg-accent/30", closed && "opacity-80")}>
      {project.coverFileId ? (
        <img src={documentContentUrl(project.coverFileId)} alt="" className="h-24 w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
      )}
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-start gap-3">
          <ProjectAvatar project={project} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link
              to={projectPath(project.id)}
              className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {project.name}
            </Link>
            <div className="flex flex-wrap items-center gap-1.5">
              {project.status !== "active" && <ProjectStatusBadge status={project.status} />}
              {project.tag && <span className="truncate text-xs text-muted-foreground">{project.tag}</span>}
            </div>
          </div>
        </div>

        {project.budgetCents !== null ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{t("budget.label")}</span>
              <span className="font-medium tabular-nums">{text.money(project.budgetCents)}</span>
            </div>
            <ProjectBudgetBar budget={project.budget} />
            <ProjectBudgetBadge budget={project.budget} className="self-start" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("budget.noBudgetSpent", { amount: text.money(project.budget.spentCents + project.budget.committedCents) })}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {period && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3.5" aria-hidden="true" />
              {period}
            </span>
          )}
          {project.tasks.total > 0 && (
            <span className="flex items-center gap-1 tabular-nums">
              <ListChecksIcon className="size-3.5" aria-hidden="true" />
              {t("tasks.progress", { done: project.tasks.done, total: project.tasks.total })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
