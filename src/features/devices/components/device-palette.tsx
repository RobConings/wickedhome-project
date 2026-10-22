import { ExternalLinkIcon, MapPinOffIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { PlanMarkerPaletteItem } from "@/features/places";
import type { Device, DeviceProfile } from "../types/devices";
import { deviceIconComponent } from "./device-icons";
import type { DeviceState } from "./device-indicator";

type DevicePaletteProps = {
  /** Devices that are not on any plan yet. */
  unplaced: Device[];
  profiles: DeviceProfile[];
  stateOf: (device: Device) => DeviceState | null;
  /** Devices in a room of this floor come first. */
  floorId: string;
  /** A position is being saved. */
  saving?: boolean;
  /** The devices could not be loaded. */
  failed?: boolean;
  /** The device selected on the plan, to take it off again. */
  selected?: Device | null;
  onRemove?: (id: string) => void;
  /** Tap-to-place: "Place on plan" on a device, then a tap on the plan puts it there. */
  placingId?: string | null;
  onPlace?: (id: string) => void;
};

/**
 * The editor's palette: unplaced devices to drag onto the plan (or "Place on plan", then tap a spot, for
 * touch, pen and keyboard), and actions for the selected one.
 */
export function DevicePalette({
  unplaced,
  profiles,
  stateOf,
  floorId,
  saving = false,
  failed = false,
  selected,
  onRemove,
  placingId = null,
  onPlace,
}: DevicePaletteProps) {
  const { t } = useTranslation("devices");
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const sorted = [...unplaced].sort(
    (a, b) => Number(b.place?.floorId === floorId) - Number(a.place?.floorId === floorId) || a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-3">
      {saving && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {t("placement.saving")}
        </p>
      )}
      {failed && <p className="text-sm text-destructive">{t("placement.loadFailed")}</p>}
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{selected.name}</span>
            {onRemove && <span className="text-xs text-muted-foreground">{t("placement.nudgeHint")}</span>}
          </span>
          <span className="flex gap-1">
            <Button asChild size="sm" variant="ghost">
              <Link to={`/devices/${selected.id}`}>
                <ExternalLinkIcon />
                {t("placement.open")}
              </Link>
            </Button>
            {onRemove && (
              <Button size="sm" variant="outline" onClick={() => onRemove(selected.id)}>
                <MapPinOffIcon />
                {t("placement.remove")}
              </Button>
            )}
          </span>
        </div>
      )}
      {failed ? null : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("placement.allPlaced")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={t("placement.unplacedLabel")}>
          {sorted.map((device) => {
            const profile = byId.get(device.profileId);
            const state = stateOf(device);
            return (
              <PlanMarkerPaletteItem
                key={device.id}
                hint={t("placement.dragHint")}
                onPlace={onPlace && (() => onPlace(device.id))}
                placing={placingId === device.id}
                placeLabel={t("placement.placeOnPlan")}
                entry={{
                  id: device.id,
                  label: device.name,
                  description: device.place?.name ?? profile?.name ?? null,
                  tone: state?.indicator.tone ?? "neutral",
                  color: state?.indicator.color,
                  icon: deviceIconComponent(profile?.icon),
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
