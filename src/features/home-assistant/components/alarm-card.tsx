import * as React from "react";
import { ShieldIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card } from "./card";
import { InlineAlert } from "./inline-alert";
import { ApiRequestError } from "../lib/api-client";
import { useLiveEvents } from "@/lib/live-events";
import { cn } from "@/lib/utils";
import { armAlarm, disarmAlarm, fetchAlarmOverview } from "../data/home-assistant-requests";
import { ALARM_STATE_EVENT, type AlarmOverview, type AlarmStateEvent } from "../types/home-assistant";
import { AlarmArmDialog } from "./alarm-arm-dialog";
import { AlarmDisarmDialog } from "./alarm-disarm-dialog";
import { AlarmStateChip } from "./alarm-state-chip";
import { alarmTone } from "./alarm-tone";
import { formatDateTime, formatRelative } from "./ha-format";

type AlarmCardProps = {
  /** From `fetchAlarmOverview()`; null (couldn't load) renders nothing. */
  overview: AlarmOverview | null;
  /** Owners and adults arm and disarm; children only see the state. */
  canControl: boolean;
  /** Dashboard: state and actions only, no history. */
  compact?: boolean;
  /** Live updates over Server-Sent Events (off in Storybook). */
  live?: boolean;
  /** Fixed clock for stories. */
  now?: number;
  className?: string;
};

const HISTORY_ROWS = 5;

/**
 * The alarm (Verisure via Home Assistant): state, the last changes, Arm (home/away) behind a confirmation and
 * Disarm with the code. Renders nothing while Home Assistant isn't configured or has no alarm panel.
 */
export function AlarmCard({ overview: initial, canControl, compact = false, live = true, now, className }: AlarmCardProps) {
  const { t, i18n } = useTranslation("home-assistant");
  const [overview, setOverview] = React.useState(initial);
  // New data from the route (revalidation) replaces what the card fetched itself.
  const [loaded, setLoaded] = React.useState(initial);
  if (loaded !== initial) {
    setLoaded(initial);
    setOverview(initial);
  }

  const reload = React.useCallback(() => {
    void fetchAlarmOverview().then((next) => next && setOverview(next));
  }, []);
  useLiveEvents<AlarmStateEvent>(
    ALARM_STATE_EVENT,
    (event) => {
      // Show the new state at once; reload for the history.
      setOverview((current) => (current?.panel?.entityId === event.entityId ? { ...current, panel: { ...current.panel, state: event.state, changedAt: event.at } } : current));
      reload();
    },
    { enabled: live },
  );
  useLiveEvents("ready", reload, { enabled: live });

  if (!overview || overview.status.state === "not_configured") return null;
  const { status, panel } = overview;
  if (status.state === "connected" && !panel) return null;

  const message = (error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 429) return t("alarm.errors.tooMany");
      if (error.code === "alarm_disarm_failed") return t("alarm.errors.disarmRefused");
      if (error.code === "code_required") return t("alarm.errors.codeRequired");
      if (error.status === 503) return t("alarm.errors.unavailable");
      if (error.status === 403) return t("alarm.errors.forbidden");
    }
    return t("alarm.errors.generic");
  };
  const arm = async (mode: "home" | "away", code: string | undefined) => {
    try {
      await armAlarm({ mode, confirm: true, ...(code && { code }) });
    } catch (error) {
      throw new Error(message(error), { cause: error });
    }
    toast.success(t(`alarm.arm.done.${mode}`));
    reload();
  };
  const disarm = async (code: string) => {
    try {
      await disarmAlarm(code);
    } catch (error) {
      throw new Error(message(error), { cause: error });
    }
    toast.success(t("alarm.disarm.done"));
    reload();
  };

  const tone = panel ? alarmTone(panel.state) : "neutral";
  const accent = tone === "danger" ? "border-l-4 border-l-destructive" : tone === "info" || tone === "warning" ? "border-l-4 border-l-primary" : undefined;
  const connected = status.state === "connected" && panel;
  const unavailable = panel?.state === "unavailable" || panel?.state === "unknown";

  return (
    <Card className={cn("gap-3", accent, className)} aria-labelledby="alarm-card-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alarm-card-title" className="flex min-w-0 items-center gap-2 font-semibold">
          <ShieldIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{panel?.name ?? t("alarm.title")}</span>
        </h2>
        {panel && <AlarmStateChip state={panel.state} />}
      </div>

      {!connected ? (
        <InlineAlert tone="error">{t("alarm.errors.unavailable")}</InlineAlert>
      ) : (
        <>
          {panel.changedAt && (
            <p className="text-sm text-muted-foreground">{t("alarm.since", { when: formatRelative(panel.changedAt, i18n.language, now) })}</p>
          )}
          {canControl && !unavailable && (
            <div className="flex flex-wrap gap-2">
              {panel.supportsArmHome && panel.state !== "armed_home" && panel.state !== "triggered" && (
                <AlarmArmDialog mode="home" panelName={panel.name} codeRequired={panel.codeArmRequired} codeFormat={panel.codeFormat} onConfirm={(code) => arm("home", code)} />
              )}
              {panel.supportsArmAway && panel.state !== "armed_away" && panel.state !== "triggered" && (
                <AlarmArmDialog mode="away" panelName={panel.name} codeRequired={panel.codeArmRequired} codeFormat={panel.codeFormat} onConfirm={(code) => arm("away", code)} />
              )}
              {panel.state !== "disarmed" && <AlarmDisarmDialog panelName={panel.name} codeFormat={panel.codeFormat} onConfirm={disarm} />}
            </div>
          )}
          {!compact && overview.history.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t pt-3">
              <h3 className="text-xs font-medium text-muted-foreground">{t("alarm.history")}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {overview.history.slice(0, HISTORY_ROWS).map((entry) => (
                  <li key={`${entry.at}-${entry.state}`} className="flex items-center justify-between gap-2">
                    <span>{t(`alarm.states.${entry.state}`)}</span>
                    <time dateTime={entry.at} className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(entry.at, i18n.language)}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
