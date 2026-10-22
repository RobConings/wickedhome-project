import { coerceFieldValue, type DeviceField, type FieldValue } from "@/features/devices/types/devices";
import { UNAVAILABLE_STATES } from "@/features/home-assistant/types/ha-entity-kind";
import type { HaDeviceSuggestion, HaEntity, HaImportPreset } from "@/features/home-assistant/types/home-assistant";
import type { HaState } from "./ha-client";

/**
 * Home Assistant state → device field value. Pure, unit-tested (home-assistant.test.ts).
 *
 * - The value is the entity's state, or one attribute of it (`haAttribute`, e.g. `current_temperature`).
 * - `unavailable` / `unknown` (device offline) → `null`: the indicator then falls back to Unknown, exactly
 *   like a stale value.
 * - Booleans: on/off, open/closed, detected/clear, true/false (coerceFieldValue).
 * - Numbers: numeric states ("21.5") and numeric attributes.
 * - Choices: the state when it is one of the field's options; alarm states have aliases so a profile made from
 *   the alarm preset still shows armed_night as "armed (home)". Anything else that doesn't fit → `null`.
 */

/** Alarm states the alarm preset has no option for, mapped onto the nearest one it has. */
const CHOICE_ALIASES: Record<string, string[]> = {
  armed_night: ["armed_home"],
  armed_custom_bypass: ["armed_home"],
  armed_vacation: ["armed_away"],
  arming: ["pending"],
  pending: ["arming"],
  disarming: ["disarmed"],
};

export type MappedValue = { value: FieldValue; available: boolean };

export function rawHaValue(state: Pick<HaState, "state" | "attributes">, attribute: string | null | undefined): unknown {
  if (!attribute) return state.state;
  return state.attributes?.[attribute];
}

export function haStateToFieldValue(
  field: Pick<DeviceField, "type" | "choices">,
  state: Pick<HaState, "state" | "attributes"> | null,
  attribute?: string | null,
): MappedValue {
  if (!state || UNAVAILABLE_STATES.has(String(state.state ?? "").toLowerCase())) return { value: null, available: false };
  const raw = rawHaValue(state, attribute);
  if (raw === undefined || raw === null) return { value: null, available: true };
  if (typeof raw === "object") return { value: null, available: true };
  const direct = coerceFieldValue(field, raw);
  if (direct !== undefined) return { value: direct, available: true };
  if (field.type === "choice") {
    for (const alias of CHOICE_ALIASES[String(raw)] ?? []) {
      const value = coerceFieldValue(field, alias);
      if (value !== undefined) return { value, available: true };
    }
  }
  if (field.type === "text") return { value: String(raw).slice(0, 200), available: true };
  return { value: null, available: true };
}

// Entity list ------------------------------------------------------------------------------------------------

/** Attributes that describe the entity rather than carry a value. */
const DESCRIPTIVE_ATTRIBUTES = new Set([
  "friendly_name",
  "unit_of_measurement",
  "device_class",
  "state_class",
  "icon",
  "entity_picture",
  "supported_features",
  "attribution",
  "options",
  "editable",
  "restored",
  "assumed_state",
]);

export function toHaEntity(state: HaState, area: string | null): HaEntity {
  const attributes = state.attributes ?? {};
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  return {
    entityId: state.entity_id,
    domain: state.entity_id.split(".")[0] ?? "",
    name: text(attributes.friendly_name) ?? state.entity_id,
    state: String(state.state ?? ""),
    unit: text(attributes.unit_of_measurement),
    deviceClass: text(attributes.device_class),
    area,
    attributeKeys: Object.entries(attributes)
      .filter(([key, value]) => !DESCRIPTIVE_ATTRIBUTES.has(key) && (typeof value === "number" || typeof value === "string" || typeof value === "boolean"))
      .map(([key]) => key)
      .sort(),
    lastChangedAt: state.last_changed ?? null,
    lastUpdatedAt: state.last_reported ?? state.last_updated ?? null,
  };
}

// Import suggestions ---------------------------------------------------------------------------------------------

const CONTACT_CLASSES = new Set(["door", "window", "garage_door", "opening"]);
const MOTION_CLASSES = new Set(["motion", "occupancy", "presence"]);
const LAUNDRY_WORDS = /(wash|dryer|laundry|wasmachine|droogkast|droger|wasdroger|machine_a_laver|seche)/;

/** Which preset (and field) an entity would become, or null when it isn't a likely device. */
export function suggestPreset(entity: Pick<HaEntity, "entityId" | "domain" | "deviceClass" | "unit" | "name">): { presetKey: HaImportPreset; fieldKey: string } | null {
  const words = `${entity.entityId} ${entity.name}`.toLowerCase();
  switch (entity.domain) {
    case "alarm_control_panel":
      return { presetKey: "alarm_panel", fieldKey: "state" };
    case "binary_sensor":
      if (entity.deviceClass && CONTACT_CLASSES.has(entity.deviceClass)) return { presetKey: "contact", fieldKey: "isOpen" };
      if (entity.deviceClass && MOTION_CLASSES.has(entity.deviceClass)) return { presetKey: "motion", fieldKey: "detected" };
      if (entity.deviceClass === "smoke") return { presetKey: "alarm_component", fieldKey: "triggered" };
      return null;
    case "sensor":
      if (entity.deviceClass === "temperature") return { presetKey: "climate", fieldKey: "temperature" };
      if ((entity.deviceClass === "power" || entity.unit === "W") && LAUNDRY_WORDS.test(words)) return { presetKey: "laundry", fieldKey: "power" };
      return null;
    default:
      return null;
  }
}

export function buildSuggestions(entities: readonly HaEntity[], boundEntityIds: ReadonlySet<string>): HaDeviceSuggestion[] {
  return entities
    .flatMap((entity): HaDeviceSuggestion[] => {
      const preset = suggestPreset(entity);
      if (!preset) return [];
      return [
        {
          entityId: entity.entityId,
          name: entity.name.slice(0, 60),
          area: entity.area,
          state: entity.state,
          unit: entity.unit,
          ...preset,
          alreadyBound: boundEntityIds.has(entity.entityId),
        },
      ];
    })
    .sort((a, b) => a.presetKey.localeCompare(b.presetKey) || (a.area ?? "").localeCompare(b.area ?? "") || a.name.localeCompare(b.name));
}
