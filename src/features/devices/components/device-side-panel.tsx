import { ExternalLinkIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shared/card";
import { cn } from "@/lib/utils";
import { PlaceBadge } from "@/features/places";
import type { Device, DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";
import type { DeviceState } from "./device-indicator";
import { DeviceStateChip } from "./device-state-chip";
import { DeviceValuesList } from "./device-values-list";

type DeviceSidePanelProps = {
  device: Device;
  profile: DeviceProfile;
  state: DeviceState | null;
  canSetValues: boolean;
  now: number;
  onClose?: () => void;
  className?: string;
};

/** The device clicked on the live plan: state, every value (manual ones settable) and a link to it. */
export function DeviceSidePanel({ device, profile, state, canSetValues, now, onClose, className }: DeviceSidePanelProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  return (
    <Card className={cn("gap-3", className)} aria-label={device.name}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
          <DeviceIcon icon={profile.icon} className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-semibold">{device.name}</h2>
          <span className="text-xs text-muted-foreground">{profile.name}</span>
        </div>
        {onClose && (
          <Button type="button" size="icon" variant="ghost" className="-mt-1 -mr-2" onClick={onClose} aria-label={tCommon("actions.close")}>
            <XIcon />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {state && <DeviceStateChip state={state} />}
        {device.place && <PlaceBadge place={device.place} />}
      </div>
      <DeviceValuesList device={device} profile={profile} canSetValues={canSetValues} now={now} />
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link to={`/devices/${device.id}`}>
          <ExternalLinkIcon />
          {t("house.openDevice")}
        </Link>
      </Button>
    </Card>
  );
}
