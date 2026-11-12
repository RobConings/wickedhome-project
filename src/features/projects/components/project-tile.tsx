import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { Text } from "@/components/ui/text";
import { RecordImage } from "@/components/shared/record-image";
import { CalendarIcon, ListChecksIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Card } from "@/components/shared/card";
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
        <RecordImage src={documentContentUrl(project.coverFileId)} className="aspect-[16/9] w-full rounded-none" fallback={<ProjectAvatar project={project} size="lg" />} />
      ) : (
        <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
      )}
      <Stack gap="3" className="px-4 pb-4">
        <Inline gap="md" align="start">
          <ProjectAvatar project={project} size="md" />
          <Stack gap="xs" className="min-w-0 flex-1">
            <Link
              to={projectPath(project.id)}
              className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {project.name}
            </Link>
            <Inline gap="1.5" align="center" wrap>
              {project.status !== "active" && <ProjectStatusBadge status={project.status} />}
              {project.tag && <span className="truncate text-xs text-muted-foreground">{project.tag}</span>}
            </Inline>
          </Stack>
        </Inline>

        {project.budgetCents !== null ? (
          <Stack gap="1.5">
            <Inline gap="sm" align="baseline" justify="between" className="text-sm">
              <span className="text-muted-foreground">{t("budget.label")}</span>
              <span className="font-medium tabular-nums">{text.money(project.budgetCents)}</span>
            </Inline>
            <ProjectBudgetBar budget={project.budget} />
            <ProjectBudgetBadge budget={project.budget} className="self-start" />
          </Stack>
        ) : (
          <Text size="sm" tone="muted" className="tabular-nums">
            {t("budget.noBudgetSpent", { amount: text.money(project.budget.spentCents + project.budget.committedCents) })}
          </Text>
        )}

        <Inline gap="none" align="center" wrap className="gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
        </Inline>
      </Stack>
    </Card>
  );
}
