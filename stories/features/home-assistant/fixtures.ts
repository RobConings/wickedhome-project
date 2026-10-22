import type { Appliance } from "@/features/energy/types/energy";
import type {
  AlarmLogEntry,
  AlarmOverview,
  AlarmPanel,
  HaConnectionStatus,
  HaDeviceSuggestion,
  HaEnergyOverview,
  HaEntity,
} from "@/features/home-assistant/types/home-assistant";

/** A fixed "now" so relative times read the same in every story. */
export const HA_NOW = new Date("2026-10-03T18:00:00Z").getTime();
const ago = (minutes: number) => new Date(HA_NOW - minutes * 60_000).toISOString();

export const connectedStatus: HaConnectionStatus = {
  state: "connected",
  url: "http://192.168.1.10:8123",
  haVersion: "2026.10.0",
  entityCount: 214,
  connectedAt: ago(60 * 26),
  lastEventAt: ago(0.2),
  errorCode: null,
  errorMessage: null,
  nextRetryAt: null,
  linked: true,
};

export const notConfiguredStatus: HaConnectionStatus = {
  ...connectedStatus,
  state: "not_configured",
  url: null,
  haVersion: null,
  entityCount: 0,
  connectedAt: null,
  lastEventAt: null,
};

export const otherHouseholdStatus: HaConnectionStatus = { ...notConfiguredStatus, errorCode: "other_household", linked: false };

export const connectingStatus: HaConnectionStatus = { ...connectedStatus, state: "connecting", entityCount: 0, connectedAt: null };

export const authErrorStatus: HaConnectionStatus = {
  ...connectedStatus,
  state: "error",
  entityCount: 0,
  connectedAt: null,
  errorCode: "auth_invalid",
  errorMessage: "The access token was rejected",
  nextRetryAt: new Date(HA_NOW + 5 * 60_000).toISOString(),
};

export const unreachableStatus: HaConnectionStatus = {
  ...authErrorStatus,
  errorCode: "unreachable",
  errorMessage: "Connection refused",
  nextRetryAt: new Date(HA_NOW + 16_000).toISOString(),
};

const entity = (entityId: string, name: string, state: string, extra: Partial<HaEntity> = {}): HaEntity => ({
  entityId,
  domain: entityId.split(".")[0] ?? "",
  name,
  state,
  unit: null,
  deviceClass: null,
  area: null,
  attributeKeys: [],
  lastChangedAt: ago(42),
  lastUpdatedAt: ago(1),
  ...extra,
});

export const entitiesFixture: HaEntity[] = [
  entity("alarm_control_panel.verisure", "Verisure", "disarmed", { attributeKeys: ["changed_by", "code_arm_required", "code_format"] }),
  entity("binary_sensor.kitchen_window", "Kitchen window", "off", { deviceClass: "window", area: "Kitchen" }),
  entity("binary_sensor.front_door", "Front door", "off", { deviceClass: "door", area: "Hall" }),
  entity("binary_sensor.living_motion", "Living motion", "on", { deviceClass: "motion", area: "Living room" }),
  entity("climate.living", "Living thermostat", "heat", { area: "Living room", attributeKeys: ["current_temperature", "hvac_action", "temperature"] }),
  entity("sensor.living_temperature", "Living temperature", "21.4", { unit: "°C", deviceClass: "temperature", area: "Living room" }),
  entity("sensor.bedroom_temperature", "Bedroom temperature", "18.9", { unit: "°C", deviceClass: "temperature", area: "Bedroom" }),
  entity("sensor.wasmachine_power", "Wasmachine power", "1240", { unit: "W", deviceClass: "power", area: "Laundry" }),
  entity("sensor.p1_meter_power", "P1 power", "830", { unit: "W", deviceClass: "power" }),
  entity("light.hall", "Hall", "off", { area: "Hall", attributeKeys: ["brightness"] }),
];

export const suggestionsFixture: HaDeviceSuggestion[] = [
  { entityId: "alarm_control_panel.verisure", name: "Verisure", area: null, state: "disarmed", unit: null, presetKey: "alarm_panel", fieldKey: "state", alreadyBound: true },
  { entityId: "sensor.bedroom_temperature", name: "Bedroom temperature", area: "Bedroom", state: "18.9", unit: "°C", presetKey: "climate", fieldKey: "temperature", alreadyBound: false },
  { entityId: "sensor.living_temperature", name: "Living temperature", area: "Living room", state: "21.4", unit: "°C", presetKey: "climate", fieldKey: "temperature", alreadyBound: false },
  { entityId: "binary_sensor.front_door", name: "Front door", area: "Hall", state: "off", unit: null, presetKey: "contact", fieldKey: "isOpen", alreadyBound: false },
  { entityId: "binary_sensor.kitchen_window", name: "Kitchen window", area: "Kitchen", state: "off", unit: null, presetKey: "contact", fieldKey: "isOpen", alreadyBound: false },
  { entityId: "sensor.wasmachine_power", name: "Wasmachine power", area: "Laundry", state: "1240", unit: "W", presetKey: "laundry", fieldKey: "power", alreadyBound: false },
];

export const panelFixture: AlarmPanel = {
  entityId: "alarm_control_panel.verisure",
  name: "Verisure",
  state: "disarmed",
  codeArmRequired: false,
  codeFormat: "number",
  supportsArmHome: true,
  supportsArmAway: true,
  changedAt: ago(95),
};

export const alarmLogFixture: AlarmLogEntry[] = [
  { id: "l1", actorName: "Clara", action: "disarm", result: "succeeded", detail: null, at: ago(95) },
  { id: "l2", actorName: "Clara", action: "disarm", result: "failed", detail: "home_assistant_error: Invalid alarm code provided", at: ago(96) },
  { id: "l3", actorName: "Rob", action: "arm_away", result: "succeeded", detail: null, at: ago(60 * 9) },
  { id: "l4", actorName: "Rob", action: "disarm", result: "rate_limited", detail: "Too many attempts", at: ago(60 * 30) },
];

export const alarmOverview = (panel: Partial<AlarmPanel> = {}, status: HaConnectionStatus = connectedStatus): AlarmOverview => ({
  status,
  panel: { ...panelFixture, ...panel },
  panels: [{ entityId: panelFixture.entityId, name: panelFixture.name }],
  history: [
    { state: "disarmed", at: ago(95) },
    { state: "armed_away", at: ago(60 * 9) },
    { state: "disarmed", at: ago(60 * 21) },
    { state: "armed_home", at: ago(60 * 31) },
  ],
  log: alarmLogFixture,
});

export const energyFixture: HaEnergyOverview = {
  status: connectedStatus,
  enabled: true,
  backfillDays: 30,
  lastImportAt: ago(53),
  lastResult: "6 statistics, 18 hours (0 new, 18 updated)",
  sources: [
    { statisticId: "sensor.p1_meter_energy_import_tariff_1", kind: "grid_import", carrier: "electricity", register: "day", intervalCount: 778, lastAt: ago(60) },
    { statisticId: "sensor.p1_meter_energy_import_tariff_2", kind: "grid_import", carrier: "electricity", register: "night", intervalCount: 778, lastAt: ago(60) },
    { statisticId: "sensor.p1_meter_energy_export_tariff_1", kind: "grid_export", carrier: "electricity", register: "day", intervalCount: 778, lastAt: ago(60) },
    { statisticId: "sensor.inverter_energy", kind: "solar_production", carrier: "electricity", register: "single", intervalCount: 778, lastAt: ago(60) },
    { statisticId: "sensor.gas_meter_gas_consumption", kind: "grid_import", carrier: "gas", register: "single", intervalCount: 0, lastAt: null },
  ],
  devices: [
    { statisticId: "sensor.wasmachine_energy", name: "Wasmachine", includedIn: null, applianceId: "a-washer", intervalCount: 778, lastAt: ago(60) },
    { statisticId: "sensor.kitchen_energy", name: "Kitchen", includedIn: null, applianceId: null, intervalCount: 0, lastAt: null },
    { statisticId: "sensor.kettle_energy", name: "Kettle", includedIn: "sensor.kitchen_energy", applianceId: null, intervalCount: 0, lastAt: null },
  ],
};

const appliance = (id: string, name: string, category: Appliance["category"]): Appliance => ({
  id,
  name,
  category,
  carriers: ["electricity"],
  placeId: null,
  place: null,
  ratedPowerW: null,
  standbyPowerW: null,
  notes: null,
  measured: false,
});

export const appliancesFixture: Appliance[] = [
  appliance("a-washer", "Washing machine", "laundry"),
  appliance("a-dryer", "Dryer", "laundry"),
  appliance("a-kettle", "Kettle", "cooking"),
  appliance("a-fridge", "Fridge", "cold"),
];
