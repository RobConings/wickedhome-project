import { CircleCheckIcon, PackageIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { Task } from "../types/tasks";

type TaskReadinessBadgeProps = {
  task: Pick<Task, "readiness" | "materials" | "status">;
  /** Short form for lists: just the material count while waiting. */
  compact?: boolean;
  className?: string;
};

/** *Waiting for materials (n/m)* → *ready to start* → *done*. */
export function TaskReadinessBadge({ task, compact = false, className }: TaskReadinessBadgeProps) {
  const { t } = useTranslation("tasks");
  const { readiness, materials } = task;

  if (readiness === "waiting") {
    const counts = { bought: materials?.bought ?? 0, total: materials?.total ?? 0 };
    return (
      <Badge variant="warning" className={className} title={t("readiness.waiting", counts)}>
        <PackageIcon aria-hidden="true" />
        {compact ? (
          <>
            <span className="tabular-nums">{`${counts.bought}/${counts.total}`}</span>
            <span className="sr-only">{t("readiness.waiting", counts)}</span>
          </>
        ) : (
          t("readiness.waiting", counts)
        )}
      </Badge>
    );
  }
  if (readiness === "ready") {
    return (
      <Badge variant="success" className={className}>
        <PlayIcon aria-hidden="true" />
        {t("readiness.ready")}
      </Badge>
    );
  }
  return (
    <Badge variant={task.status === "done" ? "success" : "neutral"} className={className}>
      <CircleCheckIcon aria-hidden="true" />
      {t(`status.${task.status}`)}
    </Badge>
  );
}
