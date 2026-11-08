import { MapPinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RecordLink as Link } from "@/components/shared/record-link";
import { Card } from "@/components/shared/card";
import { RecordImage } from "@/components/shared/record-image";
import { cn } from "@/lib/utils";
import type { Device, DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";
import type { DeviceState } from "./device-indicator";
import { DeviceStateChip } from "./device-state-chip";

type DeviceTileProps = {
  device: Device;
  profile: DeviceProfile | undefined;
  state: DeviceState | null;
  /** Defaults to the device's detail page. */
  href?: string;
  className?: string;
};

/** A device as a tile (two per row on a phone): icon, name, profile and the current state. The tile links to the device. */
export function DeviceTile({ device, profile, state, href = `/devices/${device.id}`, className }: DeviceTileProps) {
  const { t } = useTranslation("devices");
  return (
    <Card className={cn("relative gap-0 overflow-hidden p-0 transition-colors hover:bg-accent/50", className)}>
      {device.imageUrl && <RecordImage src={device.imageUrl} fallback={<DeviceIcon icon={profile?.icon} className="size-10" />} className="w-full rounded-none border-b" />}
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <DeviceIcon icon={profile?.icon} className="size-5" />
        </span>
        {!device.position && (
          <span className="text-muted-foreground" title={t("placement.notPlaced")}>
            <MapPinOffIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("placement.notPlaced")}</span>
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={href}
          className="line-clamp-2 font-medium break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {device.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{profile?.name ?? t("profiles.missing")}</span>
      </div>
      {state && <DeviceStateChip state={state} className="mt-auto self-start" />}
      </div>
    </Card>
  );
}
