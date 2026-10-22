import * as React from "react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import type { Device, DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type DevicePickerProps = SelectionsPickerBaseProps & {
  devices: Pick<Device, "id" | "name" | "profileId" | "place">[];
  /** To show each device's icon and type. */
  profiles: Pick<DeviceProfile, "id" | "name" | "icon">[];
};

/**
 * Choose a device, with the user's favourites and recently used ones on top. Works in a `<Form>` via
 * `name`. After the form saves, call `useSelections("device").recordUse(id)`.
 */
export function DevicePicker({ devices, profiles, placeholder, ...props }: DevicePickerProps) {
  const { t } = useTranslation("devices");

  const items = React.useMemo<EntityPickerItem[]>(() => {
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return devices.map((device) => {
      const profile = byId.get(device.profileId);
      return {
        id: device.id,
        label: device.name,
        description: [profile?.name, device.place?.name].filter(Boolean).join(" · "),
        leading: <DeviceIcon icon={profile?.icon} className="text-muted-foreground" />,
        keywords: [profile?.name ?? "", device.place?.name ?? "", device.place?.floorName ?? ""],
      };
    });
  }, [devices, profiles]);

  return (
    <SelectionsPicker
      {...props}
      entityType="device"
      items={items}
      awaitFavorite={false}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
