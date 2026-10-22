import * as React from "react";
import { useTranslation } from "react-i18next";
import { currentLocale } from "@/lib/i18n";
import type { PlanMarker } from "@/features/places";
import { formatFieldValue, type Device, type DeviceField, type DeviceProfile, type FieldValue } from "../types/devices";
import { evaluateIndicator, type IndicatorResult } from "../types/indicator";
import { deviceIconComponent } from "./device-icons";

/** A device's indicator, with the texts the UI shows. */
export type DeviceState = {
  indicator: IndicatorResult;
  /** "Open", "Comfortable", or "Unknown"/"No recent data" when nothing matched. */
  label: string;
  /** The primary value as text ("21,5 °C"), or null when unknown. */
  primaryText: string | null;
};

export function deviceIndicator(device: Device, profile: DeviceProfile, now: number): IndicatorResult {
  return evaluateIndicator(
    profile,
    Object.fromEntries(device.values.map((binding) => [binding.fieldKey, binding])),
    { now },
  );
}

/** Formats field values in the current language, with translated yes/no for booleans without labels. */
export function useFieldFormatter() {
  const { t } = useTranslation("devices");
  return React.useCallback(
    (field: DeviceField, value: FieldValue) => formatFieldValue(field, value, currentLocale(), { true: t("value.yes"), false: t("value.no") }),
    [t],
  );
}

/** Evaluates devices and phrases the result. `stateOf(device)` returns null for a device without a profile. */
export function useDeviceStates(profiles: DeviceProfile[], now: number) {
  const { t } = useTranslation("devices");
  const format = useFieldFormatter();
  const byId = React.useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  return React.useCallback(
    (device: Device): DeviceState | null => {
      const profile = byId.get(device.profileId);
      if (!profile) return null;
      const indicator = deviceIndicator(device, profile, now);
      const label = indicator.label ?? (indicator.stale ? t("state.stale") : t("state.unknown"));
      const primaryText = indicator.primary ? format(indicator.primary.field, indicator.primary.value) : null;
      // A choice often reads the same as the rule's label ("Armed (home)"): say it once.
      return { indicator, label, primaryText: primaryText === label ? null : primaryText };
    },
    [byId, now, t, format],
  );
}

/** Plan markers for the devices placed on one floor. */
export function useDeviceMarkers(devices: Device[], profiles: DeviceProfile[], floorId: string | null, now: number): PlanMarker[] {
  const stateOf = useDeviceStates(profiles, now);
  return React.useMemo(() => {
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return devices.flatMap((device): PlanMarker[] => {
      const profile = byId.get(device.profileId);
      const state = stateOf(device);
      if (!profile || !state || !device.position || device.floorId !== floorId) return [];
      const { indicator } = state;
      return [
        {
          id: device.id,
          x: device.position.x,
          y: device.position.y,
          tone: indicator.tone,
          color: indicator.color,
          label: `${device.name} · ${state.label}`,
          icon: deviceIconComponent(indicator.icon ?? profile.icon),
          // Booleans already speak through the label ("Open"); numbers and choices add a value.
          value: indicator.primary && indicator.primary.field.type !== "boolean" ? state.primaryText : null,
          pulse: indicator.pulse,
          dimmed: indicator.stale || (indicator.unknown && indicator.ruleId === null),
        },
      ];
    });
  }, [devices, profiles, floorId, stateOf]);
}
