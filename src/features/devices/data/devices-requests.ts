import { api, resourcePath, restResource } from "@/lib/api-client";
import type {
  Device,
  DeviceBindingsInput,
  DeviceDetail,
  DeviceFieldBinding,
  DeviceInput,
  DevicePositionInput,
  DevicePresetSummary,
  DeviceProfile,
  DeviceProfileInput,
  DevicesOverview,
  FieldValue,
  HouseStatus,
} from "../types/devices";

const devices = restResource<Device, DeviceInput, DeviceDetail>("/devices");
const profiles = restResource<DeviceProfile, DeviceProfileInput>("/devices/profiles");

/** Every device and profile of the household. */
export const fetchDevicesOverview = () => api.get<DevicesOverview>("/devices");
/**
 * Data for `HouseStatusCard` (the dashboard). A promise, so a loader can return it un-awaited and the card
 * can render in `<Suspense fallback={<HouseStatusCardSkeleton />}><Await …>`. Never rejects: no devices
 * (or no access) shows the card's empty state.
 */
export const fetchHouseStatus = (): Promise<HouseStatus> =>
  fetchDevicesOverview().catch((): HouseStatus => ({ devices: [], profiles: [] }));
export const fetchDeviceDetail = devices.get;
export const createDevice = devices.create;
export const updateDevice = devices.update;
export const deleteDevice = devices.remove;
export const updateDevicePosition = (id: string, input: DevicePositionInput) =>
  api.put<Device>(devices.path(id, "position"), input);
export const updateDeviceBindings = (id: string, input: DeviceBindingsInput) =>
  api.put<Device>(devices.path(id, "bindings"), input);
export const setDeviceValue = (id: string, fieldKey: string, value: FieldValue) =>
  api.put<DeviceFieldBinding>(devices.path(id, "values", fieldKey), { value });

export const fetchDeviceProfiles = () => profiles.list();
export const fetchDeviceProfile = profiles.get;
export const createDeviceProfile = profiles.create;
export const updateDeviceProfile = profiles.update;
export const deleteDeviceProfile = profiles.remove;

export const fetchDevicePresets = () => api.get<DevicePresetSummary[]>("/devices/presets");
/** Creates an editable profile from a preset, in the user's language. */
export const createProfileFromPreset = (key: string) => api.post<DeviceProfile>(resourcePath("/devices/presets")(key));
