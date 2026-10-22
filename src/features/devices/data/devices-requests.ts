import { api } from "@/lib/api-client";
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

const path = (id: string) => encodeURIComponent(id);

/** Every device and profile of the household. */
export const fetchDevicesOverview = () => api.get<DevicesOverview>("/devices");
/**
 * Data for `HouseStatusCard` (the dashboard). A promise, so a loader can return it un-awaited and the card
 * can render in `<Suspense fallback={<HouseStatusCardSkeleton />}><Await …>`. Never rejects: no devices
 * (or no access) shows the card's empty state.
 */
export const fetchHouseStatus = (): Promise<HouseStatus> =>
  fetchDevicesOverview().catch((): HouseStatus => ({ devices: [], profiles: [] }));
export const fetchDeviceDetail = (id: string) => api.get<DeviceDetail>(`/devices/${path(id)}`);
export const createDevice = (input: DeviceInput) => api.post<Device>("/devices", input);
export const updateDevice = (id: string, input: DeviceInput) => api.put<Device>(`/devices/${path(id)}`, input);
export const deleteDevice = (id: string) => api.delete(`/devices/${path(id)}`);
export const updateDevicePosition = (id: string, input: DevicePositionInput) =>
  api.put<Device>(`/devices/${path(id)}/position`, input);
export const updateDeviceBindings = (id: string, input: DeviceBindingsInput) =>
  api.put<Device>(`/devices/${path(id)}/bindings`, input);
export const setDeviceValue = (id: string, fieldKey: string, value: FieldValue) =>
  api.put<DeviceFieldBinding>(`/devices/${path(id)}/values/${path(fieldKey)}`, { value });

export const fetchDeviceProfiles = () => api.get<DeviceProfile[]>("/devices/profiles");
export const fetchDeviceProfile = (id: string) => api.get<DeviceProfile>(`/devices/profiles/${path(id)}`);
export const createDeviceProfile = (input: DeviceProfileInput) => api.post<DeviceProfile>("/devices/profiles", input);
export const updateDeviceProfile = (id: string, input: DeviceProfileInput) =>
  api.put<DeviceProfile>(`/devices/profiles/${path(id)}`, input);
export const deleteDeviceProfile = (id: string) => api.delete(`/devices/profiles/${path(id)}`);

export const fetchDevicePresets = () => api.get<DevicePresetSummary[]>("/devices/presets");
/** Creates an editable profile from a preset, in the user's language. */
export const createProfileFromPreset = (key: string) => api.post<DeviceProfile>(`/devices/presets/${path(key)}`);
