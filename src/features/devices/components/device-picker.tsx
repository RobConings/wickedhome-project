import * as React from "react";
import { useTranslation } from "react-i18next";
import { EntityPicker, type EntityPickerItem } from "./entity-picker";
import { useSelections, type UseSelectionsOptions } from "@/lib/selections";
import type { Device, DeviceProfile } from "../types/devices";
import { DeviceIcon } from "./device-icon";

type DevicePickerProps = Omit<React.ComponentProps<typeof EntityPicker>, "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"> & {
  devices: Pick<Device, "id" | "name" | "profileId" | "place">[];
  /** To show each device's icon and type. */
  profiles: Pick<DeviceProfile, "id" | "name" | "icon">[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose a device, with the user's favourites and recently used ones on top. Works in a `<Form>` via
 * `name`. After the form saves, call `useSelections("device").recordUse(id)`.
 */
export function DevicePicker({ devices, profiles, initialSelections, placeholder, ...props }: DevicePickerProps) {
  const { t } = useTranslation("devices");
  const { favoriteIds, recentIds, toggleFavorite } = useSelections("device", { initial: initialSelections });

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
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      onToggleFavorite={(id) => void toggleFavorite(id).catch(() => undefined)}
      placeholder={placeholder ?? t("picker.placeholder")}
    />
  );
}
