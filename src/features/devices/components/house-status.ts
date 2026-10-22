import type { Device, DeviceProfile, IndicatorTone } from "../types/devices";
import type { DeviceState } from "./device-indicator";

// What the house status card summarises, derived from devices, their profiles and evaluated states.

export type DeviceWithState = { device: Device; profile: DeviceProfile; state: DeviceState };

export type HouseSummary = {
  /** Danger and warning states, worst first. */
  alerts: DeviceWithState[];
  /** Window/door contacts that report open. */
  open: DeviceWithState[];
  /** Alarm panels (a choice field as primary value). */
  alarms: DeviceWithState[];
  /** Appliances whose indicator pulses (running). */
  running: DeviceWithState[];
  /** Climate devices with a temperature, at most `maxTemperatures`. */
  temperatures: DeviceWithState[];
  /** The worst tone of all devices, for the card's accent. */
  worstTone: IndicatorTone | null;
};

const TONE_RANK: Record<IndicatorTone, number> = { danger: 0, warning: 1, info: 2, success: 3, neutral: 4 };

export const byWorstTone = (a: DeviceWithState, b: DeviceWithState) =>
  TONE_RANK[a.state.indicator.tone] - TONE_RANK[b.state.indicator.tone] || a.device.name.localeCompare(b.device.name);

const isContact = (profile: DeviceProfile) =>
  profile.presetKey === "contact" || profile.fields.some((field) => field.key === "isOpen" && field.type === "boolean");

const isAlarmPanel = (profile: DeviceProfile) =>
  profile.presetKey === "alarm_panel" ||
  (profile.category === "alarm" && profile.fields.some((field) => field.key === profile.primaryField && field.type === "choice"));

export function summarizeHouse(
  devices: Device[],
  profiles: DeviceProfile[],
  stateOf: (device: Device) => DeviceState | null,
  maxTemperatures = 4,
): HouseSummary {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const all = devices.flatMap((device): DeviceWithState[] => {
    const profile = byId.get(device.profileId);
    const state = stateOf(device);
    return profile && state ? [{ device, profile, state }] : [];
  });
  const fresh = (entry: DeviceWithState) => !entry.state.indicator.stale;

  const open = all.filter((entry) => {
    if (!isContact(entry.profile) || !fresh(entry)) return false;
    const value = entry.device.values.find((binding) => binding.fieldKey === "isOpen")?.value;
    return value === true || value === "on" || value === "true";
  });
  const alarms = all.filter((entry) => isAlarmPanel(entry.profile));
  const running = all.filter((entry) => entry.profile.category === "appliance" && entry.state.indicator.pulse && fresh(entry));
  const temperatures = all
    .filter((entry) => {
      const primary = entry.state.indicator.primary;
      return entry.profile.category === "climate" && primary?.field.type === "number" && primary.field.unit === "°C" && primary.value !== null;
    })
    .sort(byWorstTone)
    .slice(0, maxTemperatures);
  const alerts = all.filter((entry) => entry.state.indicator.tone === "danger" || entry.state.indicator.tone === "warning").sort(byWorstTone);
  const worst = [...all].sort(byWorstTone)[0];

  return { alerts, open, alarms, running, temperatures, worstTone: worst?.state.indicator.tone ?? null };
}
