import { useTranslation } from "react-i18next";
import { TagChip } from "./tag-chip";
import { projectPath, type ProjectRef } from "@/types/projects";

/** The project an expense counts towards, linking to it. */
export function ExpenseProjectChip({ project, className }: { project: ProjectRef | null; className?: string }) {
  const { t } = useTranslation("expenses");
  if (!project) return null;
  return (
    <TagChip
      label={project.name}
      color={project.color}
      to={projectPath(project.id)}
      title={t("project.chip", { name: project.name })}
      className={className}
    />
  );
}
