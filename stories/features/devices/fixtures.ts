import type { Appliance } from "@/features/energy";
import { devicePresetProfile, listDevicePresets } from "@/features/devices/types/device-presets";
import type {
  Device,
  DeviceFieldBinding,
  DevicePlace,
  DeviceProfile,
  DevicesOverview,
  FieldValue,
  ValueSource,
} from "@/features/devices/types/devices";
import type { Place } from "@/features/places";
import { firstFloorPlanFixture, groundFloorPlanFixture, outsidePlanFixture, placeFixtures } from "../places/fixtures";

/**
 * The sample house from the places fixtures, with devices: kitchen windows (one open), the living room
 * thermostat at 21,5 °C, the bedroom at 17 °C, the dryer running, the alarm armed (home), a smoke detector
 * in the hall and the jacuzzi in the garden. The clock is fixed so "stale" and "5 min ago" are stable.
 */
export const DEVICES_NOW = Date.parse("2026-10-02T18:00:00Z");
const minutesAgo = (minutes: number) => new Date(DEVICES_NOW - minutes * 60_000).toISOString();

function profile(id: string, presetKey: string, deviceCount: number): DeviceProfile {
  const data = devicePresetProfile(presetKey, "en");
  if (!data) throw new Error(`Unknown preset ${presetKey}`);
  return { ...data, id, deviceCount, presetKey, fallbackLabel: data.fallbackLabel ?? null };
}

export const profileFixtures = {
  contact: profile("dp-contact", "contact", 3),
  climate: profile("dp-climate", "climate", 3),
  laundry: profile("dp-laundry", "laundry", 1),
  alarmPanel: profile("dp-alarm", "alarm_panel", 1),
  smoke: profile("dp-smoke", "alarm_component", 1),
  light: profile("dp-light", "light", 1),
  /** A custom profile: the jacuzzi has its own temperature bands. */
  jacuzzi: {
    id: "dp-jacuzzi",
    name: "Jacuzzi",
    icon: "waves",
    category: "climate",
    fields: [
      { key: "temperature", label: "Water temperature", type: "number", unit: "°C" },
      { key: "heating", label: "Heater", type: "boolean", trueLabel: "Heating", falseLabel: "Off" },
    ],
    primaryField: "temperature",
    rules: [
      { id: "ready", field: "temperature", operator: "gte", value: 36, tone: "success", label: "Ready", icon: "waves", pulse: false },
      { id: "heating", field: "heating", operator: "is_true", tone: "warning", label: "Heating up", icon: "flame", pulse: true },
      { id: "cold", field: "temperature", operator: "lt", value: 36, tone: "info", label: "Too cold", pulse: false },
    ],
    fallbackTone: "neutral",
    fallbackLabel: null,
    staleAfterMinutes: 60,
    presetKey: null,
    deviceCount: 1,
  },
} satisfies Record<string, DeviceProfile>;

export const profilesFixture: DeviceProfile[] = Object.values(profileFixtures);

const toDevicePlace = (place: Place): DevicePlace => ({
  id: place.id,
  name: place.name,
  kind: place.kind,
  color: place.color,
  icon: place.icon,
  floorId: place.floorId,
  floorName: place.floorName,
});

type ValueSpec = FieldValue | { value: FieldValue; minutesAgo?: number; source?: ValueSource; haEntityId?: string };

function device(
  id: string,
  name: string,
  deviceProfile: DeviceProfile,
  place: Place | null,
  position: { x: number; y: number; floorId: string } | null,
  values: Record<string, ValueSpec>,
  extra: Partial<Device> = {},
): Device {
  const bindings: DeviceFieldBinding[] = deviceProfile.fields.map((field) => {
    const spec = values[field.key];
    const full = spec !== null && typeof spec === "object" ? spec : { value: spec ?? null };
    const source = full.source ?? "manual";
    return {
      fieldKey: field.key,
      source,
      haEntityId: full.haEntityId ?? null,
      haAttribute: null,
      value: full.value,
      updatedAt: full.value === null && source === "manual" ? null : minutesAgo(full.minutesAgo ?? 12),
    };
  });
  return {
    id,
    name,
    notes: null,
    profileId: deviceProfile.id,
    place: place ? toDevicePlace(place) : null,
    floorId: position?.floorId ?? null,
    position: position ? { x: position.x, y: position.y } : null,
    appliance: null,
    values: bindings,
    ...extra,
  };
}

const ground = groundFloorPlanFixture.floor.id;
const outside = outsidePlanFixture.floor.id;
const ha = (value: FieldValue, entity: string, minutes = 2) => ({ value, source: "home_assistant" as const, haEntityId: entity, minutesAgo: minutes });

export const deviceFixtures = {
  kitchenWindowLeft: device("d-kitchen-left", "Kitchen window left", profileFixtures.contact, placeFixtures.kitchen, { x: 760, y: 45, floorId: ground }, {
    isOpen: ha(true, "binary_sensor.kitchen_window_left", 4),
    battery: ha(78, "sensor.kitchen_window_left_battery", 30),
  }),
  kitchenWindowRight: device("d-kitchen-right", "Kitchen window right", profileFixtures.contact, placeFixtures.kitchen, { x: 860, y: 45, floorId: ground }, {
    isOpen: ha(false, "binary_sensor.kitchen_window_right", 600),
    battery: ha(91, "sensor.kitchen_window_right_battery", 30),
  }),
  livingWindow: device("d-living-window", "Living room window", profileFixtures.contact, placeFixtures.living, { x: 300, y: 45, floorId: ground }, {
    isOpen: false,
  }),
  livingThermostat: device("d-living-thermostat", "Living room thermostat", profileFixtures.climate, placeFixtures.living, { x: 160, y: 220, floorId: ground }, {
    temperature: ha(21.5, "sensor.living_temperature", 3),
    humidity: ha(48, "sensor.living_humidity", 3),
  }),
  bedroomThermostat: device("d-bedroom-thermostat", "Bedroom thermostat", profileFixtures.climate, placeFixtures.bedroom, null, {
    temperature: { value: 17, minutesAgo: 25 },
    humidity: { value: 55, minutesAgo: 25 },
  }),
  officeSensor: device("d-office-sensor", "Office sensor", profileFixtures.climate, placeFixtures.office, { x: 870, y: 620, floorId: ground }, {
    temperature: ha(23, "sensor.office_temperature", 190),
    humidity: ha(40, "sensor.office_humidity", 190),
  }),
  dryer: device(
    "d-dryer",
    "Dryer",
    profileFixtures.laundry,
    placeFixtures.storage,
    { x: 545, y: 770, floorId: ground },
    { power: ha(1250, "sensor.dryer_plug_power", 1), remainingMinutes: ha(42, "sensor.dryer_remaining_time", 1) },
    { appliance: { id: "a-dryer", name: "Dryer" }, notes: "Smart plug in the storage room." },
  ),
  alarmPanel: device("d-alarm", "Alarm panel", profileFixtures.alarmPanel, placeFixtures.hall, { x: 70, y: 740, floorId: ground }, {
    state: ha("armed_home", "alarm_control_panel.verisure", 45),
  }),
  hallSmoke: device("d-hall-smoke", "Hall smoke detector", profileFixtures.smoke, placeFixtures.hall, { x: 230, y: 540, floorId: ground }, {
    triggered: false,
    bypassed: false,
    battery: 85,
  }),
  jacuzzi: device("d-jacuzzi", "Jacuzzi", profileFixtures.jacuzzi, placeFixtures.jacuzzi, { x: 400, y: 400, floorId: outside }, {
    temperature: ha(37.5, "sensor.jacuzzi_water_temperature", 5),
    heating: ha(false, "switch.jacuzzi_heater", 5),
  }),
  terraceLight: device("d-terrace-light", "Terrace light", profileFixtures.light, placeFixtures.terrace, { x: 500, y: 1350, floorId: outside }, {
    on: true,
    brightness: 70,
  }),
} satisfies Record<string, Device>;

export const devicesFixture: Device[] = Object.values(deviceFixtures);

export const devicesOverviewFixture: DevicesOverview = { devices: devicesFixture, profiles: profilesFixture };

export const housePlansFixture = [groundFloorPlanFixture, firstFloorPlanFixture, outsidePlanFixture];

export const devicePlacesFixture: Place[] = Object.values(placeFixtures);

export const deviceAppliancesFixture: Appliance[] = [
  {
    id: "a-dryer",
    name: "Dryer",
    category: "laundry",
    carriers: ["electricity"],
    placeId: placeFixtures.storage.id,
    place: toDevicePlace(placeFixtures.storage),
    ratedPowerW: 2500,
    standbyPowerW: 1,
    notes: null,
    measured: true,
  },
  {
    id: "a-jacuzzi",
    name: "Jacuzzi heater",
    category: "jacuzzi_pool",
    carriers: ["electricity"],
    placeId: placeFixtures.jacuzzi.id,
    place: toDevicePlace(placeFixtures.jacuzzi),
    ratedPowerW: 3000,
    standbyPowerW: 20,
    notes: null,
    measured: false,
  },
];

export const presetsFixture = listDevicePresets("en");

export const deviceSelectionsFixture = { favoriteIds: ["d-dryer"], recentIds: ["d-living-thermostat", "d-kitchen-left"] };
