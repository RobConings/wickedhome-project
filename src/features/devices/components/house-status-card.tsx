import type * as React from "react";
import { ArrowRightIcon, HouseWifiIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "./card";
import { IconChip } from "./icon-chip";
import type { LiveEventsStatus } from "@/lib/live-events";
import { cn } from "@/lib/utils";
import { PlanMarkerDot } from "@/features/places";
import { useLiveDevices } from "../data/use-live-devices";
import { useNow } from "../data/use-now";
import type { HouseStatus } from "../types/devices";
import { useDeviceStates } from "./device-indicator";
import { DeviceStateChip } from "./device-state-chip";
import { summarizeHouse, type DeviceWithState } from "./house-status";
import { LiveStatusBadge } from "./live-status-badge";

type HouseStatusCardProps = {
  /** From `fetchHouseStatus()`. */
  status: HouseStatus;
  /** Live updates over Server-Sent Events (off in Storybook). */
  live?: boolean;
  /** Show this connection state without connecting (stories). */
  liveStatus?: LiveEventsStatus;
  /** Fixed clock for stories and tests. */
  now?: number;
  className?: string;
};

const MAX_ALERTS = 4;

/**
 * The house at a glance, for the dashboard: what needs attention first (worst state on top), open windows
 * and doors, the alarm, running appliances and a few temperatures. Stays live over the event stream.
 */
export function HouseStatusCard({ status, live = true, liveStatus, now: fixedNow, className }: HouseStatusCardProps) {
  const { t } = useTranslation("devices");
  const now = useNow(60_000, fixedNow);
  const devices = useLiveDevices(status.devices, { enabled: live && !liveStatus });
  const stateOf = useDeviceStates(status.profiles, now);
  const summary = summarizeHouse(devices, status.profiles, stateOf);
  const tone = summary.worstTone === "danger" ? "danger" : summary.worstTone === "warning" ? "warning" : "default";

  return (
    // In the devices colour wherever it is shown (e.g. on the dashboard); a status edge when something needs attention.
    <Card data-accent="devices" tone={tone} className={cn("gap-4", className)} aria-labelledby="house-status-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="house-status-title" className="flex items-center gap-2 font-semibold">
          <IconChip icon={HouseWifiIcon} size="sm" />
          {t("houseStatus.title")}
        </h2>
        {(live || liveStatus) && devices.length > 0 && <LiveStatusBadge status={liveStatus} />}
      </div>

      {devices.length === 0 ? (
        <div className="flex min-w-0 flex-col items-start gap-2 break-words">
          <p className="font-medium">{t("houseStatus.empty.title")}</p>
          <p className="text-sm text-muted-foreground">{t("houseStatus.empty.description")}</p>
          <Button asChild size="sm" variant="outline" fullOnMobile>
            <Link to="/devices">{t("houseStatus.empty.action")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {summary.alerts.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label={t("houseStatus.attention")}>
              {summary.alerts.slice(0, MAX_ALERTS).map((entry) => (
                <DeviceLine key={entry.device.id} entry={entry} />
              ))}
              {summary.alerts.length > MAX_ALERTS && (
                <li className="text-xs text-muted-foreground">{t("houseStatus.more", { count: summary.alerts.length - MAX_ALERTS })}</li>
              )}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <PlanMarkerDot tone="success" />
              {t("houseStatus.allQuiet")}
            </p>
          )}

          {/* Phones: one fact per line (label left, value right); three columns from `sm`. */}
          <dl className="grid grid-cols-1 gap-2 border-t pt-3 text-sm sm:grid-cols-3 sm:gap-3">
            <Fact label={t("houseStatus.open")}>
              {summary.open.length === 0 ? t("houseStatus.allClosed") : t("houseStatus.openCount", { count: summary.open.length })}
            </Fact>
            <Fact label={t("houseStatus.alarm")}>
              {summary.alarms[0] ? (
                <DeviceStateChip state={summary.alarms[0].state} showValue={false} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Fact>
            <Fact label={t("houseStatus.running")}>
              {summary.running.length === 0 ? (
                <span className="text-muted-foreground">{t("houseStatus.nothingRunning")}</span>
              ) : (
                summary.running.map((entry) => entry.device.name).join(", ")
              )}
            </Fact>
          </dl>

          {summary.temperatures.length > 0 && (
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2" aria-label={t("houseStatus.temperatures")}>
              {summary.temperatures.map(({ device, state }) => (
                <li key={device.id} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlanMarkerDot tone={state.indicator.tone} color={state.indicator.color} />
                    <span className="truncate">{device.place?.name ?? device.name}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{state.primaryText ?? state.label}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Phones: a full-width row whose label wraps (never clipped); a small link at the bottom right from `sm`. */}
      <Button asChild variant="ghost" size="sm" fullOnMobile className="mt-auto sm:-mb-1 sm:self-end">
        <Link to="/house">
          {t("houseStatus.openHouse")}
          <ArrowRightIcon />
        </Link>
      </Button>
    </Card>
  );
}

function DeviceLine({ entry }: { entry: DeviceWithState }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-2 text-sm">
      <Link to={`/devices/${entry.device.id}`} className="min-w-0 break-words hover:underline">
        {entry.device.name}
      </Link>
      <DeviceStateChip state={entry.state} />
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      {/* Wraps: the running appliances are only listed here, so nothing may be cut off. */}
      <dd className="min-w-0 text-right font-medium break-words sm:text-left">{children}</dd>
    </div>
  );
}
