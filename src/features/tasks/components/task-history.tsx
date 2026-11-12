import { Text } from "@/components/ui/text";
import { Stack } from "@/components/layout/stack";
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

  if (history.length === 0) return <Text size="sm" tone="muted">{t("history.empty")}</Text>;

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
            <Stack gap="0.5" className="min-w-0 text-sm">
              <Text>
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
              </Text>
              {entry.occurrenceDate && (
                <Text size="xs" tone="muted">{t("history.forDate", { date: text.day(entry.occurrenceDate) })}</Text>
              )}
              {entry.note && <Text tone="muted" className="whitespace-pre-line">“{entry.note}”</Text>}
            </Stack>
          </li>
        );
      })}
    </ol>
  );
}
