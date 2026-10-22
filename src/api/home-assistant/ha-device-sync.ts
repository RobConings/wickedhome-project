import type { DeviceField, DeviceProfile } from "@/features/devices/types/devices";
import { onDevicesChanged } from "../devices/device-hooks";
import { setDeviceValue } from "../devices/devices.service";
import { db } from "../lib/db";
import type { HaState } from "./ha-client";
import { getEntityState, getEntityStates, haHouseholdId, onEntityState, onStatesLoaded } from "./ha-connection";
import { haStateToFieldValue } from "./ha-state-mapping";

/**
 * Device fields bound to Home Assistant entities follow them live:
 *
 * - an in-memory index entity → bound fields (only the HA household's devices), rebuilt when devices change
 *   (device-hooks.ts) and at most once a minute otherwise;
 * - every `state_changed` of a bound entity → `setDeviceValue(…, "home_assistant")`, which stores the value,
 *   sets `valueAt` and streams `device.value` to the browsers (SSE). State changes include attribute-only
 *   updates, so `valueAt` moves on every report Home Assistant sends us, not only when the value changes;
 * - on (re)connect and on a new binding, the current state is applied at once;
 * - `refreshBoundStates()` (job `home-assistant.refresh-states`) re-applies states that Home Assistant
 *   reported again without a change (`last_reported` newer than our `valueAt`), so staleness stays right.
 */

type BoundField = {
  householdId: string;
  deviceId: string;
  fieldKey: string;
  attribute: string | null;
  field: Pick<DeviceField, "type" | "choices">;
  valueAt: Date | null;
};

const INDEX_MAX_AGE_MS = 60_000;
let index: Map<string, BoundField[]> | null = null;
let indexBuiltAt = 0;
let building: Promise<Map<string, BoundField[]>> | null = null;
let started = false;

async function buildIndex(): Promise<Map<string, BoundField[]>> {
  const householdId = await haHouseholdId();
  const result = new Map<string, BoundField[]>();
  if (!householdId) return result;
  const rows = await db.deviceFieldValue.findMany({
    where: { source: "HOME_ASSISTANT", haEntityId: { not: null }, device: { householdId } },
    select: {
      deviceId: true,
      fieldKey: true,
      haEntityId: true,
      haAttribute: true,
      valueAt: true,
      device: { select: { profile: { select: { fields: true } } } },
    },
  });
  for (const row of rows) {
    const field = (row.device.profile.fields as DeviceProfile["fields"]).find((candidate) => candidate.key === row.fieldKey);
    if (!field || !row.haEntityId) continue;
    const list = result.get(row.haEntityId) ?? [];
    list.push({ householdId, deviceId: row.deviceId, fieldKey: row.fieldKey, attribute: row.haAttribute, field, valueAt: row.valueAt });
    result.set(row.haEntityId, list);
  }
  return result;
}

async function getIndex(force = false): Promise<Map<string, BoundField[]>> {
  if (!force && index && Date.now() - indexBuiltAt < INDEX_MAX_AGE_MS) return index;
  building ??= buildIndex()
    .then((built) => {
      index = built;
      indexBuiltAt = Date.now();
      return built;
    })
    .finally(() => {
      building = null;
    });
  return building;
}

export function invalidateBindingIndex(): void {
  indexBuiltAt = 0;
}

/** Entity ids that a device field of the household is bound to. */
export async function boundEntityIds(): Promise<Set<string>> {
  return new Set((await getIndex()).keys());
}

async function applyToField(binding: BoundField, state: HaState | null): Promise<boolean> {
  const { value } = haStateToFieldValue(binding.field, state, binding.attribute);
  try {
    const saved = await setDeviceValue(binding.householdId, binding.deviceId, binding.fieldKey, value, "home_assistant");
    binding.valueAt = saved.updatedAt ? new Date(saved.updatedAt) : new Date();
    return true;
  } catch (error) {
    // A deleted device or a field that no longer exists: the next index rebuild drops it.
    invalidateBindingIndex();
    console.warn(`[home-assistant] could not update ${binding.deviceId}.${binding.fieldKey}:`, (error as Error).message);
    return false;
  }
}

/** Applies one entity's state to every field bound to it. Returns how many fields were updated. */
export async function applyEntityState(entityId: string, state: HaState | null): Promise<number> {
  const bindings = (await getIndex()).get(entityId);
  if (!bindings?.length) return 0;
  let updated = 0;
  for (const binding of bindings) if (await applyToField(binding, state)) updated += 1;
  return updated;
}

/** Applies the current state of every bound entity (after a (re)connect). */
export async function applyAllBoundStates(): Promise<number> {
  const current = await getIndex(true);
  let updated = 0;
  for (const entityId of current.keys()) {
    const state = getEntityState(entityId);
    if (state) updated += await applyEntityState(entityId, state);
  }
  return updated;
}

async function applyDevice(deviceId: string): Promise<void> {
  const current = await getIndex(true);
  for (const [entityId, bindings] of current) {
    const state = getEntityState(entityId);
    if (!state) continue;
    for (const binding of bindings) {
      if (binding.deviceId === deviceId) await applyToField(binding, state);
    }
  }
}

const reportedAt = (state: HaState) => new Date(state.last_reported ?? state.last_updated ?? 0);

/**
 * Re-applies bound states that Home Assistant reported (again) after our last update, so a sensor that keeps
 * sending the same value isn't shown as stale. Used by the `home-assistant.refresh-states` job.
 */
export async function refreshBoundStates(): Promise<{ checked: number; updated: number }> {
  const current = await getIndex(true);
  let checked = 0;
  let updated = 0;
  const known = new Map(getEntityStates().map((state) => [state.entity_id, state]));
  for (const [entityId, bindings] of current) {
    const state = known.get(entityId);
    if (!state) continue;
    for (const binding of bindings) {
      checked += 1;
      if (!binding.valueAt || reportedAt(state) > binding.valueAt) {
        if (await applyToField(binding, state)) updated += 1;
      }
    }
  }
  return { checked, updated };
}

/** Wires the sync into the connection and the devices feature. Idempotent. */
export function startDeviceSync(): void {
  if (started) return;
  started = true;
  onEntityState((entityId, state) => {
    void applyEntityState(entityId, state).catch((error: Error) => console.error("[home-assistant] device sync failed", error.message));
  });
  onStatesLoaded(() => {
    void applyAllBoundStates()
      .then((count) => count > 0 && console.log(`[home-assistant] applied ${count} bound device values`))
      .catch((error: Error) => console.error("[home-assistant] device sync failed", error.message));
  });
  onDevicesChanged((householdId, event) => {
    invalidateBindingIndex();
    if (!event.deviceId || event.action === "deleted") return;
    void haHouseholdId()
      .then((haHousehold) => (haHousehold === householdId && event.deviceId ? applyDevice(event.deviceId) : undefined))
      .catch((error: Error) => console.error("[home-assistant] device sync failed", error.message));
  });
}
