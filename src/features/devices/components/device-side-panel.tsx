import { Inline } from "@/components/layout/inline";
import { Stack } from "@/components/layout/stack";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
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
  hideHeading?: boolean;
  className?: string;
};

/** The device clicked on the live plan: state, every value (manual ones settable) and a link to it. */
export function DeviceSidePanel({ device, profile, state, canSetValues, now, onClose, hideHeading = false, className }: DeviceSidePanelProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation();
  return (
    <Card className={cn("gap-3", className)} aria-label={device.name}>
      {!hideHeading && <Inline gap="md" align="start">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-section-soft text-section">
          <DeviceIcon icon={profile.icon} className="size-5" />
        </span>
        <Stack gap="xs" className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{device.name}</h2>
          <span className="text-xs text-muted-foreground">{profile.name}</span>
        </Stack>
        {onClose && (
          <Button type="button" size="icon" variant="ghost" className="-mt-1 -mr-2" onClick={onClose} aria-label={tCommon("actions.close")}>
            <XIcon />
          </Button>
        )}
      </Inline>}
      <Inline gap="sm" align="center" wrap>
        {state && <DeviceStateChip state={state} />}
        {device.place && <PlaceBadge place={device.place} />}
      </Inline>
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
