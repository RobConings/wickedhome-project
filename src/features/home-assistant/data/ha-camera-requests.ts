import { api, ApiRequestError } from "@/lib/api-client";
import type { HaCameraStream, HaDeviceCameras } from "../types/ha-camera";

const base = (deviceId: string) => `/home-assistant/devices/${encodeURIComponent(deviceId)}/cameras`;
export const fetchDeviceCameras = (deviceId: string) => api.get<HaDeviceCameras>(base(deviceId));
export const requestCameraSnapshot = (deviceId: string, entityId: string) => api.post(`${base(deviceId)}/snapshot`, { entityId });
export const requestCameraStream = (deviceId: string, entityId: string) => api.post<HaCameraStream>(`${base(deviceId)}/streams`, { entityId });
export const releaseCameraStream = (deviceId: string, sessionId: string) => fetch(`/api${base(deviceId)}/streams/${encodeURIComponent(sessionId)}`, {
  method: "DELETE", credentials: "same-origin", headers: { "X-WickedHome": "1" }, keepalive: true,
}).catch(() => {});

export async function fetchCameraImage(deviceId: string, entityId: string, signal: AbortSignal) {
  const response = await fetch(`/api${base(deviceId)}/image?${new URLSearchParams({ entityId })}`, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new ApiRequestError(response.status, "camera_unavailable", "Camera image unavailable");
  return { blob: await response.blob(), version: response.headers.get("X-Camera-Image-Version") };
}
