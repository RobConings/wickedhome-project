import type { Device } from "@/features/devices";
import { Stack } from "@/components/layout/stack";
import { HaDeviceControlPanel } from "./ha-device-controls";
import { HaCameraPanel } from "./ha-camera-panel";
import type { HaDeviceCameras } from "../types/ha-camera";
import type { HaDeviceControls } from "../types/home-assistant";
import { HaAlarmPanel } from "./ha-alarm-panel";

/** Shared by device details and the selected marker on the live floor plan. */
export function HaDeviceActions({ device, initialCameras, initialControls, previewImage, canControl = true }: { device: Pick<Device, "id" | "values">; initialCameras?: HaDeviceCameras; initialControls?: HaDeviceControls; previewImage?: string; canControl?: boolean }) {
  const domains = new Set(device.values.flatMap((value) => value.source === "home_assistant" && value.haEntityId ? [value.haEntityId.split(".")[0]] : []));
  const switches = ["light", "switch", "fan", "cover", "climate", "water_heater", "media_player"].some((domain) => domains.has(domain));
  if (!switches && !domains.has("camera") && !domains.has("alarm_control_panel")) return null;
  return <Stack gap="md">
    {domains.has("alarm_control_panel") && <HaAlarmPanel canControl={canControl} />}
    {canControl && domains.has("camera") && <HaCameraPanel key={device.id} deviceId={device.id} initial={initialCameras} previewImage={previewImage} />}
    {canControl && switches && <HaDeviceControlPanel key={device.id} deviceId={device.id} initial={initialControls} />}
  </Stack>;
}
