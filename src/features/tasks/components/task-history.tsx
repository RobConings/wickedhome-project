import { CircleCheckIcon, SkipForwardIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HabitantAvatar, type Habitant } from "@/features/household";
import type { TaskCompletion } from "../types/tasks";
import { useTaskText } from "./use-task-text";

type TaskHistoryProps = {
  history: TaskCompletion[];
  habitants: Habitant[];
};

/** Who did it, when, and their note: newest first. */
export function TaskHistory({ history, habitants }: TaskHistoryProps) {
  const { t } = useTranslation("tasks");
  const text = useTaskText();

  if (history.length === 0) return <p className="text-sm text-muted-foreground">{t("history.empty")}</p>;

  return (
    <ol className="flex flex-col gap-4">
      {history.map((entry) => {
        const who = habitants.find((habitant) => habitant.id === entry.completedById);
        const Icon = entry.outcome === "done" ? CircleCheckIcon : SkipForwardIcon;
        const when = text.instant(entry.completedAt, { weekday: "short" });
        return (
          <li key={entry.id} className="flex gap-3">
            {who ? (
              <HabitantAvatar habitant={who} size="sm" />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
            )}
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <p>
                <span className="font-medium">
                  {entry.outcome === "done"
                    ? who
                      ? t("history.doneBy", { name: who.name })
                      : t("history.done")
                    : who
                      ? t("history.skippedBy", { name: who.name })
                      : t("history.skipped")}
                </span>
                <span className="text-muted-foreground"> · {when}</span>
              </p>
              {entry.occurrenceDate && (
                <p className="text-xs text-muted-foreground">{t("history.forDate", { date: text.day(entry.occurrenceDate) })}</p>
              )}
              {entry.note && <p className="whitespace-pre-line text-muted-foreground">“{entry.note}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
