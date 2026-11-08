import { useDeviceMarkers, useDeviceStates } from "../components/device-indicator";
import { useLiveDevices } from "./use-live-devices";
import { useNow } from "./use-now";
import type { DevicesOverview } from "../types/devices";

const EMPTY: DevicesOverview = { devices: [], profiles: [] };

/** Read-only live map contribution for Home; state/freshness semantics remain owned by Devices. */
export function useHomeDevicePlan(overview: DevicesOverview | null, floorId: string | null, live = true, fixedNow?: number) {
  const source = overview ?? EMPTY;
  const devices = useLiveDevices(source.devices, { enabled: live && overview !== null });
  const now = useNow(30_000, fixedNow);
  return { devices, markers: useDeviceMarkers(devices, source.profiles, floorId, now), stateOf: useDeviceStates(source.profiles, now) };
}
