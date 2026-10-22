import type { DeviceChangedEvent } from "@/features/devices/types/devices";

/**
 * Server-side listeners for device changes (created, edited, re-bound, deleted). The Home Assistant sync
 * uses it to refresh its entity → field index and to take the current state of a newly bound entity, so the
 * devices feature never has to know about Home Assistant.
 */
type Listener = (householdId: string, event: DeviceChangedEvent) => void;

const listeners = new Set<Listener>();

export function onDevicesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDevicesChanged(householdId: string, event: DeviceChangedEvent): void {
  for (const listener of listeners) {
    try {
      listener(householdId, event);
    } catch (error) {
      console.error("device change listener failed", error);
    }
  }
}
