import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AssistantSkillInfo } from "../types/assistant";

type AssistantSkillsListProps = {
  skills: AssistantSkillInfo[];
};

/**
 * What the assistant can do for this person: every skill (area) with its tools, each with its permission
 * (reads, changes, sensitive) and when it asks for confirmation. Shown on the Assistant card.
 */
export function AssistantSkillsList({ skills }: AssistantSkillsListProps) {
  const { t } = useTranslation("assistant");
  return (
    <div className="flex flex-col gap-3">
      {skills.map((skill) => (
        <section key={skill.id} aria-labelledby={`skill-${skill.id}`} className="flex flex-col gap-1.5">
          <div className="flex min-w-0 flex-col">
            <h4 id={`skill-${skill.id}`} className="text-sm font-medium">
              {skill.title}
            </h4>
            <p className="text-xs text-pretty break-words text-muted-foreground">{skill.summary}</p>
          </div>
          <ul className="flex flex-col gap-1">
            {skill.tools.map((tool) => (
              <li key={tool.name} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                <span className="min-w-0 break-words">
                  {tool.activity}
                  <code className="ml-1.5 text-xs text-muted-foreground">{tool.name}</code>
                </span>
                <span className="flex flex-wrap gap-1">
                  {tool.permission === "write" && tool.confirm !== "never" && <Badge variant="outline">{t(`card.confirm.${tool.confirm}`)}</Badge>}
                  <Badge variant={tool.permission === "read" ? "secondary" : tool.permission === "sensitive" ? "destructive" : "outline"}>
                    {t(`card.permission.${tool.permission}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
