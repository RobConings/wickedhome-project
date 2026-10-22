import * as React from "react";
import { ChevronDownIcon, ClockIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { currentLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { AutomationJob } from "../types/automations";
import { dateTimeText, relativeTime, scheduleText } from "./automation-format";
import { AutomationRunHistory } from "./automation-run-history";
import { JobRunStatusBadge } from "./job-run-status-badge";

type AutomationJobRowProps = {
  job: AutomationJob;
  canManage: boolean;
  /** Current time (ms), so relative times stay fresh. */
  now: number;
  /** "Run now" was clicked and the server hasn't confirmed yet. */
  starting?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onRun: () => void;
  /** Open the run history from the start (stories). */
  defaultExpanded?: boolean;
};

/**
 * One automation: what it does, when it runs, how its last run went, a switch to pause it and "Run now".
 * The recent runs open below it.
 */
export function AutomationJobRow({ job, canManage, now, starting = false, onEnabledChange, onRun, defaultExpanded = false }: AutomationJobRowProps) {
  const { t } = useTranslation("automations");
  const locale = currentLocale();
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const title = t(job.titleKey);
  const historyId = `automation-${job.id}-runs`;
  const switchId = `automation-${job.id}-enabled`;
  const busy = starting || job.running;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="leading-tight font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{t(job.descriptionKey)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={switchId} className={cn("text-sm", job.enabled ? "text-foreground" : "text-muted-foreground")}>
            {job.enabled ? t("job.on") : t("job.paused")}
          </label>
          <Switch
            id={switchId}
            checked={job.enabled}
            disabled={!canManage}
            onCheckedChange={onEnabledChange}
            aria-label={t("job.toggle", { title })}
          />
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t("job.schedule")}</dt>
        <dd className="flex items-center gap-1.5">
          <ClockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          {scheduleText(t, locale, job.schedule)}
        </dd>

        <dt className="text-muted-foreground">{t("job.next")}</dt>
        <dd>
          {job.nextRunAt ? (
            <time dateTime={job.nextRunAt} title={dateTimeText(job.nextRunAt, locale)}>
              {relativeTime(job.nextRunAt, locale, now)} <span className="text-muted-foreground">({dateTimeText(job.nextRunAt, locale)})</span>
            </time>
          ) : (
            <span className="text-muted-foreground">{t("job.pausedNext")}</span>
          )}
        </dd>

        <dt className="text-muted-foreground">{t("job.last")}</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {job.running ? (
            <JobRunStatusBadge status="running" />
          ) : job.lastRun ? (
            <>
              <JobRunStatusBadge status={job.lastRun.status} />
              <time dateTime={job.lastRun.startedAt} title={dateTimeText(job.lastRun.startedAt, locale)}>
                {relativeTime(job.lastRun.startedAt, locale, now)}
              </time>
              {(job.lastRun.status === "failed" ? job.lastRun.error : job.lastRun.summary) && (
                <span className={cn("min-w-0 break-words", job.lastRun.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                  · {job.lastRun.status === "failed" ? job.lastRun.error : job.lastRun.summary}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{t("job.never")}</span>
          )}
        </dd>

        {job.lastCheckedAt && (
          <>
            <dt className="text-muted-foreground">{t("job.lastCheck")}</dt>
            <dd className="min-w-0 break-words">
              <time dateTime={job.lastCheckedAt} title={dateTimeText(job.lastCheckedAt, locale)}>
                {relativeTime(job.lastCheckedAt, locale, now)}
              </time>{" "}
              <span className="text-muted-foreground">· {t("job.lastCheckHint")}</span>
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <Button variant="outline" size="sm" className="min-h-10 sm:min-h-8" loading={busy} disabled={busy} onClick={onRun}>
            <PlayIcon />
            {busy ? t("job.running") : t("job.runNow")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 sm:min-h-8"
          aria-expanded={expanded}
          aria-controls={historyId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
          {expanded ? t("history.hide") : t("history.show")}
        </Button>
      </div>

      {expanded && (
        <div id={historyId}>
          <AutomationRunHistory runs={job.recentRuns} now={now} />
        </div>
      )}
    </li>
  );
}
