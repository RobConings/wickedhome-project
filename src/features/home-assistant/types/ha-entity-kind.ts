import type { HaEntity } from "./home-assistant";

// What kind of value an entity's state carries, so the entity browser can show which entities fit a
// device field (a boolean field wants on/off, open/closed). Pure; shared by the API and the UI.

export type HaValueKind = "boolean" | "number" | "text";

const BOOLEAN_STATES = new Set(["on", "off", "open", "closed", "true", "false", "detected", "clear", "home", "not_home"]);
const BOOLEAN_DOMAINS = new Set(["binary_sensor", "switch", "light", "input_boolean", "fan", "lock"]);
export const UNAVAILABLE_STATES = new Set(["unavailable", "unknown", ""]);

export function entityValueKind(entity: Pick<HaEntity, "domain" | "state" | "unit">): HaValueKind {
  if (BOOLEAN_DOMAINS.has(entity.domain) || BOOLEAN_STATES.has(entity.state.toLowerCase())) return "boolean";
  if (entity.unit || (entity.state.trim() !== "" && Number.isFinite(Number(entity.state)))) return "number";
  return "text";
}

/**
 * Field type → which entities fit it. Choice fields take text states (alarm states); a number field also
 * takes an entity with attributes, since one of them may be the number (a thermostat's `current_temperature`).
 */
export function entityFitsField(
  entity: Pick<HaEntity, "domain" | "state" | "unit"> & { attributeKeys?: readonly string[] },
  fieldType: "boolean" | "number" | "text" | "choice",
): boolean {
  const kind = entityValueKind(entity);
  if (fieldType === "boolean") return kind === "boolean";
  if (fieldType === "number") return kind === "number" || (entity.attributeKeys?.length ?? 0) > 0;
  return true;
}

/** Lower-case, accent-free text for searching names and areas. */
export const searchText = (entity: Pick<HaEntity, "entityId" | "name" | "area" | "domain">) =>
  `${entity.name} ${entity.entityId} ${entity.area ?? ""} ${entity.domain}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
