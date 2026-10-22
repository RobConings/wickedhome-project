import { AlarmClockIcon, PartyPopperIcon, SparklesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { TodayProgress } from "../types/task-views";

type TaskTodayProgressProps = {
  progress: TodayProgress;
  /** Open tasks overdue (part of today's work). */
  overdue: number;
  /** Open tasks in total, for "12 more on the list". */
  openTotal: number;
  className?: string;
};

/**
 * The top of the total list: "3 of 5 done today" with a bar, and a celebration once nothing is left for
 * today ("All done for today") or at all ("All done").
 */
export function TaskTodayProgress({ progress, overdue, openTotal, className }: TaskTodayProgressProps) {
  const { t } = useTranslation("tasks");
  const later = openTotal - (progress.total - progress.done);

  if (progress.allDoneToday) {
    const everything = progress.allDone;
    return (
      <section
        aria-live="polite"
        className={cn(
          "flex items-center gap-4 rounded-2xl border border-success-border bg-success-soft px-4 py-4 animate-appear",
          className,
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-success text-card">
          {everything ? <PartyPopperIcon className="size-6" aria-hidden="true" /> : <SparklesIcon className="size-6" aria-hidden="true" />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">{everything ? t("allDone.title") : t("allDone.todayTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {[
              progress.done > 0 ? t("allDone.doneToday", { count: progress.done }) : null,
              everything ? t("allDone.nothingLeft") : t("allDone.later", { count: later }),
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      </section>
    );
  }

  const percent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <section aria-live="polite" className={cn("flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3 shadow-xs", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">{t("progress.today", { done: progress.done, total: progress.total })}</h2>
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-danger">
            <AlarmClockIcon className="size-3.5" aria-hidden="true" />
            {t("progress.overdue", { count: overdue })}
          </span>
        )}
      </div>
      <Progress value={percent} label={t("progress.today", { done: progress.done, total: progress.total })} />
      {later > 0 && <p className="text-xs text-muted-foreground">{t("allDone.later", { count: later })}</p>}
    </section>
  );
}
