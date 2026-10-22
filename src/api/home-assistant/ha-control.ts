import { HttpError } from "../lib/http";
import { HaNotConnectedError, type HaState } from "./ha-client";
import { connectionStatusFor, getEntityState, getEntityStates, requireConnectedClient } from "./ha-connection";

/**
 * Switching Home Assistant entities from WickedHome (the assistant's device tools): lights, switches and fans
 * on/off, light brightness, blinds/shades/curtains/shutters/awnings, a thermostat's temperature, scenes.
 *
 * Physical security is never switchable here, whatever is asked: no locks, no alarm panels, no sirens, no
 * garage doors or gates (a cover is only allowed with a blind-like device class), and no light, switch or
 * scene whose id or name mentions a door, gate, garage, lock, alarm or siren. Arming goes through ha-alarm.ts
 * only; disarming is UI-only and refused by the client itself (`isDisarmCall`).
 */

export type ControlAction = "on" | "off" | "open" | "close" | "brightness" | "position" | "temperature";
export type ControlRequest = { action: ControlAction; value?: number };
export type HaServiceCall = { domain: string; service: string; data: Record<string, unknown> };

const DOMAINS = new Set(["light", "switch", "fan", "cover", "climate", "scene"]);
/** Covers that can't let anyone in. A garage door, gate, door or window cover is never allowed. */
const SAFE_COVER_CLASSES = new Set(["blind", "shade", "curtain", "shutter", "awning"]);
/** Substrings, so Dutch compounds count too ("garagepoort", "voordeur"); "outdoor" is not a door. */
const SECURITY_WORDS = /lock|slot|garage|gate|poort|(?<!out)door|deur|alarm|siren|sirene|security|beveilig|verisure|kluis/i;

const nameOf = (state: HaState) => (typeof state.attributes?.friendly_name === "string" ? state.attributes.friendly_name : state.entity_id);
const domainOf = (entityId: string) => entityId.split(".")[0] ?? "";

/** Why an entity may not be switched from here, or null when it may. Pure (unit tested). */
export function controlRefusal(state: Pick<HaState, "entity_id" | "attributes">): string | null {
  const domain = domainOf(state.entity_id);
  if (!DOMAINS.has(domain)) return "This kind of device can't be switched from WickedHome";
  if (SECURITY_WORDS.test(state.entity_id) || SECURITY_WORDS.test(nameOf(state as HaState))) return "Doors, gates, locks and the alarm can't be switched from WickedHome";
  if (domain === "cover" && !SAFE_COVER_CLASSES.has(String(state.attributes?.device_class ?? ""))) return "Only blinds, shades, curtains, shutters and awnings can be moved from WickedHome";
  return null;
}

/** The Home Assistant service for a request on an entity, or a message why it doesn't fit. Pure. */
export function controlCall(state: Pick<HaState, "entity_id" | "attributes">, request: ControlRequest): HaServiceCall | string {
  const refusal = controlRefusal(state);
  if (refusal) return refusal;
  const domain = domainOf(state.entity_id);
  const value = request.value;
  switch (domain) {
    case "light":
      if (request.action === "brightness" && value !== undefined) return { domain, service: "turn_on", data: { brightness_pct: clamp(value, 1, 100) } };
      if (request.action === "on" || request.action === "off") return { domain, service: `turn_${request.action}`, data: {} };
      break;
    case "switch":
    case "fan":
      if (request.action === "on" || request.action === "off") return { domain, service: `turn_${request.action}`, data: {} };
      break;
    case "cover":
      if (request.action === "open" || request.action === "on") return { domain, service: "open_cover", data: {} };
      if (request.action === "close" || request.action === "off") return { domain, service: "close_cover", data: {} };
      if (request.action === "position" && value !== undefined) return { domain, service: "set_cover_position", data: { position: clamp(value, 0, 100) } };
      break;
    case "climate":
      if (request.action === "temperature" && value !== undefined) return { domain, service: "set_temperature", data: { temperature: clamp(value, 5, 30) } };
      if (request.action === "on" || request.action === "off") return { domain, service: `turn_${request.action}`, data: {} };
      break;
    case "scene":
      if (request.action === "on") return { domain, service: "turn_on", data: {} };
      break;
  }
  return `“${request.action}” doesn't fit this ${domain}`;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value * 2) / 2));

async function connectedFor(householdId: string) {
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") throw new HttpError(503, "ha_unavailable", "Home Assistant is not connected");
}

/** Sends the request to Home Assistant. Refusals are 400s with the reason; no connection is a 503. */
export async function controlEntity(householdId: string, entityId: string, request: ControlRequest): Promise<{ state: string | null }> {
  await connectedFor(householdId);
  const state = getEntityState(entityId);
  if (!state) throw new HttpError(404, "not_found", "Home Assistant doesn't know this device (any more)");
  const call = controlCall(state, request);
  if (typeof call === "string") throw new HttpError(400, "bad_request", call);
  try {
    await requireConnectedClient().sendCommand({ type: "call_service", domain: call.domain, service: call.service, service_data: call.data, target: { entity_id: entityId } });
  } catch (error) {
    if (error instanceof HaNotConnectedError) throw new HttpError(503, "ha_unavailable", "Home Assistant is not connected");
    throw new HttpError(502, "ha_failed", "Home Assistant could not do it");
  }
  return { state: getEntityState(entityId)?.state ?? null };
}

/** Scenes that may be run from here (the same safety rules), by name. Empty without a connection. */
export async function listScenes(householdId: string): Promise<{ entityId: string; name: string }[]> {
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") return [];
  return getEntityStates()
    .filter((state) => domainOf(state.entity_id) === "scene" && !controlRefusal(state))
    .map((state) => ({ entityId: state.entity_id, name: nameOf(state) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
