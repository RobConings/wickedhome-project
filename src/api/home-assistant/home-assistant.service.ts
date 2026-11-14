import { devicePresetProfile } from "@/features/devices/types/device-presets";
import { deviceProfileInputSchema } from "@/features/devices/types/devices";
import type {
  HaEntitiesResponse,
  HaImportInput,
  HaImportResult,
  HaSettingsInput,
  HaSuggestionsResponse,
} from "@/features/home-assistant/types/home-assistant";
import { createDevice, createProfile, listProfiles, setDeviceBindings, setDevicePosition } from "../devices/devices.service";
import { listPlaces } from "../places/places.service";
import { initialHaPosition, matchHaRoom } from "./ha-import-location";
import { db } from "../lib/db";
import { HttpError, badRequest } from "../lib/http";
import { HaNotConnectedError } from "./ha-client";
import { boundEntityIds } from "./ha-device-sync";
import { connectionStatusFor, getEntityArea, getEntityState, getEntityStates } from "./ha-connection";
import { buildSuggestions, suggestPreset, toHaEntity } from "./ha-state-mapping";

/** Home Assistant not reachable → 503 with a stable code the UI translates. */
export const haUnavailable = (message = "Home Assistant is not connected") => new HttpError(503, "ha_unavailable", message);

export function mapHaError(error: unknown): unknown {
  return error instanceof HaNotConnectedError ? haUnavailable(error.message) : error;
}

function entitiesOf() {
  return getEntityStates()
    .map((state) => toHaEntity(state, getEntityArea(state.entity_id)))
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
}

export async function listEntities(householdId: string): Promise<HaEntitiesResponse> {
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") return { status, entities: [] };
  return { status, entities: entitiesOf() };
}

export async function listSuggestions(householdId: string): Promise<HaSuggestionsResponse> {
  const status = await connectionStatusFor(householdId);
  if (!status.linked || status.state !== "connected") return { status, suggestions: [] };
  const places = await listPlaces(householdId);
  return { status, suggestions: buildSuggestions(entitiesOf(), await boundEntityIds()).map((suggestion) => ({ ...suggestion, placeId: matchHaRoom(suggestion.area, places)?.id ?? null })) };
}

/**
 * "Import from Home Assistant": one device per chosen entity, with a profile from the matching preset (reusing
 * a profile made from that preset earlier), its primary field bound to the entity. The device sync then takes
 * the current state at once.
 */
const imports = new Map<string, Promise<HaImportResult>>();
export function importDevices(householdId: string, locale: "en" | "nl", input: HaImportInput): Promise<HaImportResult> {
  const previous = imports.get(householdId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => runImport(householdId, locale, input));
  imports.set(householdId, next);
  void next.finally(() => { if (imports.get(householdId) === next) imports.delete(householdId); }).catch(() => {});
  return next;
}

async function runImport(householdId: string, locale: "en" | "nl", input: HaImportInput): Promise<HaImportResult> {
  const status = await connectionStatusFor(householdId);
  if (!status.linked) throw badRequest("Home Assistant is not configured");
  const profiles = await listProfiles(householdId);
  const places = await listPlaces(householdId);
  const bound = await boundEntityIds();
  const roomCounts = new Map<string, number>();
  const profileFor = new Map<string, string>();
  const deviceIds: string[] = [];
  for (const item of input.items) {
    if (bound.has(item.entityId)) continue;
    const entity = getEntityState(item.entityId);
    if (!entity) throw badRequest("This Home Assistant entity no longer exists");
    const suggestion = entity ? suggestPreset(toHaEntity(entity, null)) : null;
    // The field to bind: from the suggestion when the preset matches, else the preset's primary field.
    const preset = devicePresetProfile(item.presetKey, locale);
    if (!preset) throw badRequest("Unknown preset");
    const fieldKey = suggestion?.presetKey === item.presetKey ? suggestion.fieldKey : preset.primaryField;
    if (!fieldKey) throw badRequest("This preset has no primary field");

    let profileId = profileFor.get(item.presetKey) ?? profiles.find((profile) => profile.presetKey === item.presetKey)?.id;
    if (!profileId) {
      profileId = (await createProfile(householdId, deviceProfileInputSchema.parse(preset))).id;
    }
    profileFor.set(item.presetKey, profileId);
    const place = item.placeId ? places.find((candidate) => candidate.id === item.placeId) : item.placeId === null ? null : matchHaRoom(getEntityArea(item.entityId), places);
    if (item.placeId && !place) throw badRequest("Validation failed", { placeId: ["Unknown place"] });
    const device = await createDevice(householdId, { name: item.name, profileId, placeId: place?.id ?? null, applianceId: null, notes: null });
    await setDeviceBindings(householdId, device.id, {
      bindings: [{ fieldKey, source: "home_assistant", haEntityId: item.entityId, haAttribute: null }],
    });
    if (input.placeOnPlan && place) {
      const count = roomCounts.get(place.id) ?? 0;
      const at = initialHaPosition(place.polygon, count);
      roomCounts.set(place.id, count + 1);
      if (at) await setDevicePosition(householdId, device.id, { floorId: place.floorId, x: at.x, y: at.y });
    }
    bound.add(item.entityId);
    deviceIds.push(device.id);
  }
  return { created: deviceIds.length, deviceIds };
}

export async function saveSettings(householdId: string, input: HaSettingsInput): Promise<void> {
  const data = {
    ...(input.alarmEntityId !== undefined && { alarmEntityId: input.alarmEntityId }),
    ...(input.energyImportEnabled !== undefined && { energyImportEnabled: input.energyImportEnabled }),
    ...(input.energyBackfillDays !== undefined && { energyBackfillDays: input.energyBackfillDays }),
  };
  await db.homeAssistantSettings.upsert({ where: { householdId }, create: { householdId, ...data }, update: data });
}
