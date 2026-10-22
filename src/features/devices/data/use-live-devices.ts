import * as React from "react";
import { useRevalidator } from "react-router";
import { useLiveEvents } from "@/lib/live-events";
import { LIVE_READY_EVENT } from "@/types/live-events";
import {
  DEVICE_CHANGED_EVENT,
  DEVICE_VALUE_EVENT,
  type Device,
  type DeviceChangedEvent,
  type DeviceValueEvent,
} from "../types/devices";

type Overlay = Record<string, Record<string, DeviceValueEvent>>;

/** Applies newer live values on top of a device's loaded values. */
export function applyLiveValues(device: Device, events: Record<string, DeviceValueEvent> | undefined): Device {
  if (!events) return device;
  let changed = false;
  const values = device.values.map((binding) => {
    const event = events[binding.fieldKey];
    if (!event || (binding.updatedAt && binding.updatedAt > event.updatedAt)) return binding;
    changed = true;
    return { ...binding, value: event.value, updatedAt: event.updatedAt, source: event.source };
  });
  return changed ? { ...device, values } : device;
}

/**
 * Keeps devices current while the page is open: `device.value` events patch values in place, while
 * `device.changed` (created, moved, profile edited…) and a reconnect reload the route's data.
 */
export function useLiveDevices(devices: Device[], { enabled = true }: { enabled?: boolean } = {}): Device[] {
  const [overlay, setOverlay] = React.useState<Overlay>({});
  const revalidator = useRevalidator();
  const reload = React.useCallback(() => {
    if (revalidator.state === "idle") void revalidator.revalidate();
  }, [revalidator]);

  useLiveEvents<DeviceValueEvent>(
    DEVICE_VALUE_EVENT,
    (event) => setOverlay((current) => ({ ...current, [event.deviceId]: { ...current[event.deviceId], [event.fieldKey]: event } })),
    { enabled },
  );
  useLiveEvents<DeviceChangedEvent>(DEVICE_CHANGED_EVENT, reload, { enabled });

  // Events missed while disconnected are not replayed: reload after every reconnect (not the first open).
  const opened = React.useRef(false);
  useLiveEvents(
    LIVE_READY_EVENT,
    () => {
      if (opened.current) reload();
      opened.current = true;
    },
    { enabled },
  );

  return React.useMemo(() => devices.map((device) => applyLiveValues(device, overlay[device.id])), [devices, overlay]);
}
