import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { projectPath, type Project } from "../types/projects";
import { ProjectBudgetBadge, ProjectStatusBadge } from "./project-badges";
import { ProjectBudgetBar } from "./project-budget-bar";
import { ProjectAvatar } from "./project-icon";
import { useProjectText } from "./use-project-text";

/** One project as a list row: icon, name, tag and dates, and its budget at a glance. Content only. */
export function ProjectListItem({ project }: { project: Project }) {
  const { t } = useTranslation("projects");
  const text = useProjectText();
  const period = text.period(project);
  const details = [project.tag, period, project.tasks.total > 0 ? t("tasks.progress", { done: project.tasks.done, total: project.tasks.total }) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Inline gap="md" align="center" className="relative">
      <ProjectAvatar project={project} size="md" />
      <Stack gap="xs" className="min-w-0 flex-1">
        <Inline gap="sm" align="center" className="min-w-0">
          <Link to={projectPath(project.id)} className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline">
            {project.name}
          </Link>
          {project.status !== "active" && <ProjectStatusBadge status={project.status} />}
        </Inline>
        {details && <span className="truncate text-sm text-muted-foreground">{details}</span>}
        {project.budgetCents !== null && <ProjectBudgetBar budget={project.budget} showLegend={false} className="max-w-sm" />}
      </Stack>
      <Stack gap="xs" align="end" className="shrink-0 text-sm tabular-nums">
        <span className="font-medium">
          {project.budgetCents !== null
            ? t("budget.ofBudget", { used: text.money(project.budget.spentCents + project.budget.committedCents), budget: text.money(project.budgetCents) })
            : text.money(project.budget.spentCents + project.budget.committedCents)}
        </span>
        <ProjectBudgetBadge budget={project.budget} className="hidden sm:inline-flex" />
      </Stack>
    </Inline>
  );
}
