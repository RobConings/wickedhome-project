import type { HaControl, HaDeviceControls } from "@/features/home-assistant/types/home-assistant";
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

/** Read capabilities from HA itself. Unknown/unavailable entities expose no physical commands. */
export function describeControl(state: HaState): HaControl | null {
  if (controlRefusal(state)) return null;
  const domain = domainOf(state.entity_id);
  if (domain === "scene") return null;
  const available = !["unavailable", "unknown"].includes(state.state);
  const features = typeof state.attributes.supported_features === "number" ? state.attributes.supported_features : 0;
  const number = (key: string) => typeof state.attributes[key] === "number" ? state.attributes[key] as number : null;
  const value: HaControl = {
    entityId: state.entity_id, name: nameOf(state), state: state.state, updatedAt: state.last_updated ?? null,
    actions: [], adjustment: null,
  };
  if (!available) return value;
  if (["light", "switch", "fan"].includes(domain)) value.actions = ["on", "off"];
  if (domain === "cover") {
    if (features & 1) value.actions.push("open");
    if (features & 2) value.actions.push("close");
    if (features & 4) value.adjustment = { action: "position", value: number("current_position"), min: 0, max: 100, step: 1, unit: "%" };
  }
  const modes = state.attributes.supported_color_modes;
  if (domain === "light" && Array.isArray(modes) && modes.some((mode) => typeof mode === "string" && !["onoff", "unknown"].includes(mode))) {
    const brightness = number("brightness");
    value.adjustment = { action: "brightness", value: brightness === null ? null : Math.round(brightness / 255 * 100), min: 1, max: 100, step: 1, unit: "%" };
  }
  if (domain === "climate") {
    if (features & 256) value.actions.push("on");
    if (features & 128) value.actions.push("off");
  }
  if (domain === "climate" && (features & 1) && state.attributes.temperature_unit === "°C") {
    // controlCall currently accepts Celsius, 5–30. Do not reinterpret Fahrenheit targets.
    const min = Math.max(5, number("min_temp") ?? 5); const max = Math.min(30, number("max_temp") ?? 30);
    // Intersect the device grid with this adapter's existing half-degree command precision.
    const nativeStep = number("target_temp_step") ?? 0.5;
    const nativeMin = number("min_temp") ?? min;
    const supported: number[] = [];
    if (nativeStep > 0) for (let half = Math.ceil(min * 2); half <= Math.floor(max * 2); half++) {
      const candidate = half / 2; const steps = (candidate - nativeMin) / nativeStep;
      if (Math.abs(steps - Math.round(steps)) < 0.000001) supported.push(candidate);
    }
    if (supported.length > 1) value.adjustment = { action: "temperature", value: number("temperature"), min: supported[0]!, max: supported.at(-1)!, step: supported[1]! - supported[0]!, unit: "°C" };
  }
  return value;
}

export async function getDeviceControls(householdId: string, deviceId: string): Promise<HaDeviceControls> {
  const { db } = await import("../lib/db");
  const device = await db.device.findFirst({ where: { id: deviceId, householdId }, include: { values: true } });
  if (!device) throw new HttpError(404, "not_found", "Device not found");
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") return { connected: false, controls: [] };
  const ids = [...new Set(device.values.filter((value) => value.source === "HOME_ASSISTANT").flatMap((value) => value.haEntityId ? [value.haEntityId] : []))];
  return { connected: true, controls: ids.flatMap((id) => { const state = getEntityState(id); const description = state ? describeControl(state) : null; return description ? [description] : []; }) };
}

export async function validateDeviceControl(householdId: string, deviceId: string, entityId: string, request: ControlRequest) {
  const { controls } = await getDeviceControls(householdId, deviceId);
  const control = controls.find((value) => value.entityId === entityId);
  const allowed = control && (control.actions.some((action) => action === request.action) || control.adjustment?.action === request.action);
  if (!allowed) throw new HttpError(400, "bad_request", "This command is not currently supported by the linked device");
  if (control.adjustment?.action === request.action) {
    const adjustment = control.adjustment; const value = request.value;
    if (value === undefined || value < adjustment.min || value > adjustment.max) throw new HttpError(400, "bad_request", "Choose a value within the device range");
    const steps = (value - adjustment.min) / adjustment.step;
    if (Math.abs(steps - Math.round(steps)) > 0.000001) throw new HttpError(400, "bad_request", "Choose a supported device increment");
  }
}

export async function controlDevice(householdId: string, deviceId: string, entityId: string, request: ControlRequest) {
  await validateDeviceControl(householdId, deviceId, entityId, request);
  return controlEntity(householdId, entityId, request);
}
