import { ThermometerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/shared/card";
import { currentLocale } from "@/lib/i18n";
import { PlanMarkerDot } from "@/features/places";
import type { Device, DeviceProfile } from "../types/devices";
import type { DeviceState } from "./device-indicator";
import { byName } from "@/types/collections";

type RoomTemperaturesProps = {
  devices: Device[];
  profiles: DeviceProfile[];
  stateOf: (device: Device) => DeviceState | null;
  /** Only rooms on this floor. */
  floorId: string | null;
};

type Room = { name: string; values: number[]; state: DeviceState };

/**
 * Temperature per room on the current floor: the average of the room's temperature devices (their primary
 * field in °C), coloured like the first device's indicator. Unknown and stale values are left out.
 */
export function RoomTemperatures({ devices, profiles, stateOf, floorId }: RoomTemperaturesProps) {
  const { t } = useTranslation("devices");
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const rooms = new Map<string, Room>();
  for (const device of devices) {
    const profile = byId.get(device.profileId);
    const field = profile?.fields.find((candidate) => candidate.key === profile.primaryField);
    if (!device.place || !field || field.type !== "number" || field.unit !== "°C") continue;
    if ((device.floorId ?? device.place.floorId) !== floorId) continue;
    const state = stateOf(device);
    const value = state?.indicator.primary?.value;
    if (!state || state.indicator.stale || typeof value !== "number") continue;
    const room = rooms.get(device.place.id) ?? { name: device.place.name, values: [], state };
    room.values.push(value);
    rooms.set(device.place.id, room);
  }
  if (rooms.size === 0) return null;
  const format = new Intl.NumberFormat(currentLocale() === "nl" ? "nl-BE" : "en-BE", { maximumFractionDigits: 1 });

  return (
    <Card className="gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <ThermometerIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        {t("house.temperatures")}
      </h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {[...rooms.values()]
          .sort(byName)
          .map((room) => (
            <li key={room.name} className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <PlanMarkerDot tone={room.state.indicator.tone} color={room.state.indicator.color} />
                <span className="truncate">{room.name}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{format.format(room.values.reduce((sum, value) => sum + value, 0) / room.values.length)} °C</span>
            </li>
          ))}
      </ul>
    </Card>
  );
}
