import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import type { JobRun } from "../types/automations";
import { dateTimeText, durationText, relativeTime } from "./automation-format";
import { JobRunStatusBadge } from "./job-run-status-badge";

type AutomationRunHistoryProps = {
  runs: JobRun[];
  /** Current time (ms), so relative times stay fresh. */
  now: number;
};

/** A job's recent runs, newest first: outcome, how it started, when, how long, and the error or summary. */
export function AutomationRunHistory({ runs, now }: AutomationRunHistoryProps) {
  const { t } = useTranslation("automations");
  const locale = currentLocale();

  if (runs.length === 0) return <p className="text-sm text-muted-foreground">{t("history.empty")}</p>;

  return (
    <ol className="flex flex-col divide-y rounded-lg border">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <JobRunStatusBadge status={run.status} />
            <time dateTime={run.startedAt} title={dateTimeText(run.startedAt, locale)} className="text-foreground">
              {relativeTime(run.startedAt, locale, now)}
            </time>
            <span className="text-muted-foreground">
              · {t(`trigger.${run.trigger}`)}
              {run.durationMs !== null && run.status !== "skipped" && <> · {durationText(t, run.durationMs)}</>}
            </span>
          </div>
          {run.error && (
            <p className={run.status === "failed" ? "break-words text-destructive" : "break-words text-muted-foreground"}>{run.error}</p>
          )}
          {run.summary && <p className="break-words text-muted-foreground">{run.summary}</p>}
          {run.log && (
            <details className="group">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs text-muted-foreground underline-offset-4 hover:underline">
                {t("history.log")}
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{run.log}</pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}
