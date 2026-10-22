import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { projectPath } from "@/types/projects";
import { cn } from "@/lib/utils";
import type { ContactProjectLink } from "../types/contacts";

type ContactProjectChipsProps = {
  projects: ContactProjectLink[];
  className?: string;
};

/** The projects a contact works on, as chips linking to the project ("Badkamer renovatie · aannemer"). Finished ones are dimmed. */
export function ContactProjectChips({ projects, className }: ContactProjectChipsProps) {
  const { t } = useTranslation("contacts");
  if (!projects.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label={t("projects.label")}>
      {projects.map((project) => (
        <li key={project.id} className="min-w-0 max-w-full">
          <Link
            to={projectPath(project.id)}
            title={t("projects.linkLabel", { name: project.name })}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent",
              !project.running && "text-muted-foreground opacity-80",
            )}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden="true" />
            <span className="min-w-0 break-words">
              {project.name}
              {project.role && <span className="text-muted-foreground"> · {project.role}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
