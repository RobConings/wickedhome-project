import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { Text } from "@/components/ui/text";
import type * as React from "react";
import { ArrowRightIcon, HouseWifiIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
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
      <Inline gap="sm" align="center" justify="between" wrap>
        <h2 id="house-status-title" className="flex items-center gap-2 font-semibold">
          <IconChip icon={HouseWifiIcon} size="sm" />
          {t("houseStatus.title")}
        </h2>
        {(live || liveStatus) && devices.length > 0 && <LiveStatusBadge status={liveStatus} />}
      </Inline>

      {devices.length === 0 ? (
        <Stack gap="sm" align="start" className="min-w-0 break-words">
          <Text weight="medium">{t("houseStatus.empty.title")}</Text>
          <Text size="sm" tone="muted">{t("houseStatus.empty.description")}</Text>
          <Button asChild size="sm" variant="outline" fullOnMobile>
            <Link to="/devices">{t("houseStatus.empty.action")}</Link>
          </Button>
        </Stack>
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
            <Text size="sm" className="flex items-center gap-2">
              <PlanMarkerDot tone="success" />
              {t("houseStatus.allQuiet")}
            </Text>
          )}

          {/* This card can be narrow on a desktop dashboard too. Rows follow the card width. */}
          <dl className="grid min-w-0 grid-cols-1 gap-3 border-t pt-3 text-sm">
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
            <ul className="grid grid-cols-1 gap-y-2 text-sm" aria-label={t("houseStatus.temperatures")}>
              {summary.temperatures.map(({ device, state }) => (
                <li key={device.id} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <PlanMarkerDot tone={state.indicator.tone} color={state.indicator.color} />
                    <span className="min-w-0 break-words">{device.place?.name ?? device.name}</span>
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
    <Inline gap="md" align="start" justify="between" wrap className="min-w-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      {/* Wraps: the running appliances are only listed here, so nothing may be cut off. */}
      <dd className="min-w-0 max-w-full text-right font-medium break-words">{children}</dd>
    </Inline>
  );
}
