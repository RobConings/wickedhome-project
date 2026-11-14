import type { HaControl, HaDeviceControls, HaControlAction } from "@/features/home-assistant/types/home-assistant";
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

export type ControlAction = HaControlAction;
export type ControlRequest = { action: ControlAction; value?: number; option?: string };
export type HaServiceCall = { domain: string; service: string; data: Record<string, unknown> };

const DOMAINS = new Set(["light", "switch", "fan", "cover", "climate", "water_heater", "media_player", "scene"]);
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
      if (request.action === "mode" && request.option) return { domain, service: "set_hvac_mode", data: { hvac_mode: request.option } };
      if (request.action === "preset" && request.option) return { domain, service: "set_preset_mode", data: { preset_mode: request.option } };
      if (request.action === "temperature" && value !== undefined) return { domain, service: "set_temperature", data: { temperature: clamp(value, 5, 30) } };
      if (request.action === "on" || request.action === "off") return { domain, service: `turn_${request.action}`, data: {} };
      break;
    case "water_heater":
      if (request.action === "operation" && request.option) return { domain, service: "set_operation_mode", data: { operation_mode: request.option } };
      if (request.action === "temperature" && value !== undefined) return { domain, service: "set_temperature", data: { temperature: value } };
      if (request.action === "on" || request.action === "off") return { domain, service: `turn_${request.action}`, data: {} };
      break;
    case "media_player": {
      if (request.action === "volume" && value !== undefined) return { domain, service: "volume_set", data: { volume_level: value / 100 } };
      if (request.action === "mute" || request.action === "unmute") return { domain, service: "volume_mute", data: { is_volume_muted: request.action === "mute" } };
      if (request.action === "source" && request.option) return { domain, service: "select_source", data: { source: request.option } };
      const services: Record<string, string> = { on: "turn_on", off: "turn_off", play: "media_play", pause: "media_pause", stop: "media_stop", next: "media_next_track", previous: "media_previous_track" };
      if (services[request.action]) return { domain, service: services[request.action]!, data: {} };
      break;
    }
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

export async function systemTemperatureUnit(): Promise<string | null> {
  try {
    const settings = await requireConnectedClient().sendCommand<{ unit_system?: { temperature?: string } }>({ type: "get_config" });
    return settings.unit_system?.temperature ?? null;
  } catch {
    return null;
  }
}

/** Sends the request to Home Assistant. Refusals are 400s with the reason; no connection is a 503. */
export async function controlEntity(householdId: string, entityId: string, request: ControlRequest): Promise<{ state: string | null }> {
  await connectedFor(householdId);
  const state = getEntityState(entityId);
  if (!state) throw new HttpError(404, "not_found", "Home Assistant doesn't know this device (any more)");
  const call = controlCall(state, request);
  if (typeof call === "string") throw new HttpError(400, "bad_request", call);
  if (domainOf(entityId) !== "scene") {
    validateControlRequest(describeControl(state, await systemTemperatureUnit()), request);
  }
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
export function describeControl(state: HaState, systemUnit: string | null = null): HaControl | null {
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
  if (domain === "media_player") {
    const flags: [number, HaControlAction][] = [[128, "on"], [256, "off"], [1, "pause"], [16384, "play"], [4096, "stop"], [16, "previous"], [32, "next"]];
    for (const [flag, action] of flags) if (features & flag) value.actions.push(action);
    if (features & 8) value.actions.push(state.attributes.is_volume_muted === true ? "unmute" : "mute");
    if (features & 4) value.adjustment = { action: "volume", value: number("volume_level") === null ? null : Math.round(number("volume_level")! * 100), min: 0, max: 100, step: 1, unit: "%" };
  }
  const choices: NonNullable<HaControl["choices"]> = [];
  const choice = (action: "mode" | "preset" | "operation" | "source", list: string, current: string) => {
    const raw = state.attributes[list];
    if (Array.isArray(raw)) {
      const options = raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 150);
      if (options.length) choices.push({ action, values: options, value: typeof state.attributes[current] === "string" ? state.attributes[current] as string : action === "mode" ? state.state : null });
    }
  };
  if (domain === "climate") { choice("mode", "hvac_modes", "hvac_mode"); if (features & 16) choice("preset", "preset_modes", "preset_mode"); }
  if (domain === "water_heater" && (features & 2)) choice("operation", "operation_list", "operation_mode");
  if (domain === "media_player" && (features & 2048)) choice("source", "source_list", "source");
  if (choices.length) value.choices = choices;
  if (domain === "water_heater" && (features & 8)) value.actions.push("on", "off");
  // Climate entities normally use HA's configured temperature unit without an entity attribute.
  const temperatureUnit = state.attributes.temperature_unit ?? systemUnit;
  if (domain === "water_heater" && (features & 1) && temperatureUnit === "°C") value.adjustment = { action: "temperature", value: number("temperature"), min: number("min_temp") ?? 30, max: number("max_temp") ?? 60, step: number("target_temp_step") ?? 1, unit: "°C" };
  if (domain === "climate" && (features & 1) && temperatureUnit === "°C") {
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
  const unit = ids.some((id) => ["climate", "water_heater"].includes(domainOf(id))) ? await systemTemperatureUnit() : null;
  return { connected: true, controls: ids.flatMap((id) => { const state = getEntityState(id); const description = state ? describeControl(state, unit) : null; return description ? [description] : []; }) };
}

export function validateControlRequest(control: HaControl | null | undefined, request: ControlRequest) {
  const selection = control?.choices?.find((choice) => choice.action === request.action);
  const allowed = control && (control.actions.some((action) => action === request.action) || control.adjustment?.action === request.action || selection?.values.includes(request.option ?? ""));
  if (!allowed) throw new HttpError(400, "bad_request", "This command is not currently supported by the linked device");
  if (control.adjustment?.action === request.action) {
    const adjustment = control.adjustment; const value = request.value;
    if (value === undefined || !Number.isFinite(value) || value < adjustment.min || value > adjustment.max) throw new HttpError(400, "bad_request", "Choose a value within the device range");
    const steps = (value - adjustment.min) / adjustment.step;
    if (Math.abs(steps - Math.round(steps)) > 0.000001) throw new HttpError(400, "bad_request", "Choose a supported device increment");
  }
}

export async function validateDeviceControl(householdId: string, deviceId: string, entityId: string, request: ControlRequest) {
  const { controls } = await getDeviceControls(householdId, deviceId);
  validateControlRequest(controls.find((value) => value.entityId === entityId), request);
}

export async function controlDevice(householdId: string, deviceId: string, entityId: string, request: ControlRequest) {
  await validateDeviceControl(householdId, deviceId, entityId, request);
  return controlEntity(householdId, entityId, request);
}
