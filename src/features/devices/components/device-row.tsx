import { ChevronRightIcon, MapPinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { Device, DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";
import type { DeviceState } from "./device-indicator";
import { DeviceStateChip } from "./device-state-chip";

type DeviceRowProps = {
  device: Device;
  profile: DeviceProfile | undefined;
  state: DeviceState | null;
  /** Defaults to the device's detail page. */
  href?: string;
  className?: string;
};

/**
 * One device as a row of a list (content only; the list draws the dividers and padding): icon, name,
 * profile and the current state. The whole row links to the device.
 */
export function DeviceRow({ device, profile, state, href = `/devices/${device.id}`, className }: DeviceRowProps) {
  const { t } = useTranslation("devices");
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Link
        to={href}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <DeviceIcon icon={profile?.icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{device.name}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {profile?.name ?? t("profiles.missing")}
            {!device.position && (
              <span className="inline-flex items-center gap-1" title={t("placement.notPlaced")}>
                · <MapPinOffIcon className="size-3" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t("placement.notPlaced")}</span>
              </span>
            )}
          </span>
        </span>
        {state && <DeviceStateChip state={state} className="hidden sm:inline-flex" />}
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {state && <DeviceStateChip state={state} className="ml-12 self-start sm:hidden" />}
    </div>
  );
}
