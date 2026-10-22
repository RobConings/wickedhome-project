import type { HaConnectionStatus, HaErrorCode, HaTestResult } from "@/features/home-assistant/types/home-assistant";
import { HA_STATUS_EVENT } from "@/features/home-assistant/types/home-assistant";
import { config } from "../lib/config";
import { db } from "../lib/db";
import { publish } from "../lib/events";
import { HaCommandError, HaNotConnectedError, HomeAssistantClient, type HaClientStatus, type HaSocketFactory, type HaState, type StateChangedData } from "./ha-client";

/**
 * The app's one Home Assistant connection. Started by server.ts next to the job scheduler and stopped on
 * shutdown. Keeps an in-memory copy of every entity state (from `get_states`, then `state_changed` events),
 * the area of each entity, and fans state changes out to the device sync and the alarm.
 *
 * Home Assistant is household-wide: it belongs to one household (HOME_ASSISTANT_HOUSEHOLD_ID, or the only
 * household in the database). Other households see "not configured".
 */

/** `previous` is Home Assistant's `old_state` of the change (null for a new entity). */
type StateListener = (entityId: string, state: HaState | null, previous: HaState | null) => void;

let client: HomeAssistantClient | null = null;
const states = new Map<string, HaState>();
let areaByEntity = new Map<string, string>();
let lastEventAt: Date | null = null;
const stateListeners = new Set<StateListener>();
const syncListeners = new Set<() => void>();
let householdCache: { id: string | null; at: number } | null = null;
let statusPublishTimer: ReturnType<typeof setTimeout> | null = null;

export const isHomeAssistantConfigured = () => Boolean(config.HOME_ASSISTANT_URL && config.HOME_ASSISTANT_TOKEN);

/** Origin of the configured URL (shown on the card); never the token. */
function configuredOrigin(): string | null {
  if (!config.HOME_ASSISTANT_URL) return null;
  try {
    const url = new URL(config.HOME_ASSISTANT_URL);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return config.HOME_ASSISTANT_URL.slice(0, 120);
  }
}

/** The household Home Assistant serves, or null (none, or several without HOME_ASSISTANT_HOUSEHOLD_ID). */
export async function haHouseholdId(): Promise<string | null> {
  if (config.HOME_ASSISTANT_HOUSEHOLD_ID) return config.HOME_ASSISTANT_HOUSEHOLD_ID;
  // Only a found household is cached: right after setup (no household yet) the next call must see the new one.
  if (householdCache?.id && Date.now() - householdCache.at < 5 * 60_000) return householdCache.id;
  const households = await db.household.findMany({ select: { id: true }, take: 2, orderBy: { createdAt: "asc" } });
  householdCache = { id: households.length === 1 ? (households[0]?.id ?? null) : null, at: Date.now() };
  return householdCache.id;
}

export async function isHaHousehold(householdId: string): Promise<boolean> {
  return isHomeAssistantConfigured() && (await haHouseholdId()) === householdId;
}

export function getHaClient(): HomeAssistantClient | null {
  return client;
}

export const getEntityStates = (): HaState[] => [...states.values()];
export const getEntityState = (entityId: string): HaState | null => states.get(entityId) ?? null;
export const getEntityArea = (entityId: string): string | null => areaByEntity.get(entityId) ?? null;

/** Every state change (and removal: `null`) of any entity. Returns the unsubscribe function. */
export function onEntityState(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** After each (re)connect, once every state has been loaded. */
export function onStatesLoaded(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

export function connectionStatus(linked: boolean): HaConnectionStatus {
  const base = {
    url: null,
    haVersion: null,
    entityCount: 0,
    connectedAt: null,
    lastEventAt: null,
    errorCode: null,
    errorMessage: null,
    nextRetryAt: null,
    linked,
  } satisfies Omit<HaConnectionStatus, "state">;
  if (!isHomeAssistantConfigured()) return { ...base, state: "not_configured" };
  if (!linked) return { ...base, state: "not_configured", errorCode: "other_household" };
  const status = client?.getStatus();
  if (!status) return { ...base, state: "connecting", url: configuredOrigin() };
  return {
    ...base,
    state: status.state,
    url: configuredOrigin(),
    haVersion: status.haVersion,
    entityCount: status.state === "connected" ? states.size : 0,
    connectedAt: status.connectedAt?.toISOString() ?? null,
    lastEventAt: lastEventAt?.toISOString() ?? null,
    errorCode: status.errorCode,
    errorMessage: status.errorMessage,
    nextRetryAt: status.nextRetryAt?.toISOString() ?? null,
  };
}

export async function connectionStatusFor(householdId: string): Promise<HaConnectionStatus> {
  return connectionStatus(await isHaHousehold(householdId));
}

/** Throws a clear error when the connection isn't usable (routes turn it into a 503). */
export function requireConnectedClient(): HomeAssistantClient {
  if (!client || !client.connected) throw new HaNotConnectedError();
  return client;
}

// Lifecycle -------------------------------------------------------------------------------------------------

/** Starts the connection when .env has a URL and token. Safe to call when it doesn't (does nothing). */
export function startHomeAssistant(options: { socketFactory?: HaSocketFactory } = {}): void {
  if (client || !isHomeAssistantConfigured()) {
    if (!isHomeAssistantConfigured()) console.log("[home-assistant] not configured (HOME_ASSISTANT_URL / HOME_ASSISTANT_TOKEN)");
    return;
  }
  client = new HomeAssistantClient({
    url: config.HOME_ASSISTANT_URL ?? "",
    token: config.HOME_ASSISTANT_TOKEN ?? "",
    socketFactory: options.socketFactory,
  });
  client.onStatus(scheduleStatusPublish);
  client.onConnected(() => void loadEverything());
  client.subscribeEvents("state_changed", (event) => {
    const data = event.data as unknown as StateChangedData;
    if (!data?.entity_id) return;
    lastEventAt = new Date();
    if (data.new_state) states.set(data.entity_id, data.new_state);
    else states.delete(data.entity_id);
    for (const listener of stateListeners) {
      try {
        listener(data.entity_id, data.new_state, data.old_state ?? null);
      } catch (error) {
        console.error("[home-assistant] state listener failed", error);
      }
    }
  });
  client.start();
}

export async function stopHomeAssistant(): Promise<void> {
  if (statusPublishTimer) clearTimeout(statusPublishTimer);
  statusPublishTimer = null;
  client?.stop();
  client = null;
  states.clear();
}

/** Status changes go to the HA household's browsers (debounced: a reconnect storm is one event). */
function scheduleStatusPublish(_status: HaClientStatus) {
  if (statusPublishTimer) return;
  statusPublishTimer = setTimeout(() => {
    statusPublishTimer = null;
    void haHouseholdId()
      .then((householdId) => {
        if (householdId) publish(householdId, HA_STATUS_EVENT, connectionStatus(true));
      })
      .catch(() => undefined);
  }, 500);
  statusPublishTimer.unref?.();
}

async function loadEverything() {
  const current = client;
  if (!current) return;
  try {
    const list = await current.sendCommand<HaState[]>({ type: "get_states" }, 60_000);
    states.clear();
    for (const state of list) states.set(state.entity_id, state);
    lastEventAt = new Date();
  } catch (error) {
    console.error("[home-assistant] get_states failed", (error as Error).message);
    return;
  }
  areaByEntity = await loadAreas(current).catch((error: Error) => {
    console.warn("[home-assistant] areas unavailable:", error.message);
    return areaByEntity;
  });
  scheduleStatusPublish(current.getStatus());
  for (const listener of syncListeners) {
    try {
      listener();
    } catch (error) {
      console.error("[home-assistant] sync listener failed", error);
    }
  }
}

type AreaRow = { area_id: string; name: string };
type DeviceRow = { id: string; area_id: string | null };
type EntityRow = { entity_id: string; area_id: string | null; device_id: string | null };

/** entity → area name, from the entity registry (own area, else its device's area). */
async function loadAreas(current: HomeAssistantClient): Promise<Map<string, string>> {
  const [areas, devices, entities] = await Promise.all([
    current.sendCommand<AreaRow[]>({ type: "config/area_registry/list" }),
    current.sendCommand<DeviceRow[]>({ type: "config/device_registry/list" }),
    current.sendCommand<EntityRow[]>({ type: "config/entity_registry/list" }),
  ]);
  const areaName = new Map(areas.map((area) => [area.area_id, area.name]));
  const deviceArea = new Map(devices.map((device) => [device.id, device.area_id]));
  const result = new Map<string, string>();
  for (const entity of entities) {
    const areaId = entity.area_id ?? (entity.device_id ? deviceArea.get(entity.device_id) : null);
    const name = areaId ? areaName.get(areaId) : undefined;
    if (name) result.set(entity.entity_id, name);
  }
  return result;
}

// Test connection ------------------------------------------------------------------------------------------

const errorCodeOf = (error: unknown): HaErrorCode =>
  error instanceof HaCommandError && error.code === "timeout" ? "timeout" : error instanceof HaNotConnectedError ? "unreachable" : "protocol";

/**
 * "Test connection": a ping round trip when connected; otherwise reconnect at once and wait up to 10 s for
 * the outcome.
 */
export async function testConnection(): Promise<HaTestResult> {
  const fail = (errorCode: HaErrorCode | null, errorMessage: string | null): HaTestResult => ({
    ok: false,
    haVersion: null,
    entityCount: 0,
    latencyMs: null,
    errorCode,
    errorMessage,
  });
  if (!client) return fail(null, null);
  if (!client.connected) {
    client.reconnectNow();
    const deadline = Date.now() + 10_000;
    await new Promise<void>((resolve) => {
      const check = () => {
        const status = client?.getStatus();
        if (!status || status.state !== "connecting" || Date.now() > deadline) resolve();
        else setTimeout(check, 200).unref?.();
      };
      check();
    });
  }
  const status = client?.getStatus();
  if (!client?.connected) return fail(status?.errorCode ?? "unreachable", status?.errorMessage ?? null);
  const started = Date.now();
  try {
    // `ping` is answered with `pong`, which the client resolves like a result.
    await client.sendCommand({ type: "ping" }, 5_000);
  } catch (error) {
    return fail(errorCodeOf(error), (error as Error).message);
  }
  return {
    ok: true,
    haVersion: status?.haVersion ?? null,
    entityCount: states.size,
    latencyMs: Date.now() - started,
    errorCode: null,
    errorMessage: null,
  };
}
