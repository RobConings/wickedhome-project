import { devicePresetProfile } from "@/features/devices/types/device-presets";
import {
  DEVICE_CHANGED_EVENT,
  DEVICE_VALUE_EVENT,
  bindingsForProfile,
  coerceFieldValue,
  deviceProfileInputSchema,
  type Device,
  type DeviceBindingsInput,
  type DeviceCategory,
  type DeviceChangedEvent,
  type DeviceDetail,
  type DeviceFieldBinding,
  type DeviceInput,
  type DevicePositionInput,
  type DeviceProfile,
  type DeviceProfileData,
  type DevicesOverview,
  type DeviceValueEvent,
  type FieldValue,
  type IndicatorTone,
  type ValueSource,
} from "@/features/devices/types/devices";
import {
  db,
  Prisma,
  type DeviceCategory as DeviceCategoryRow,
  type DeviceValueSource as DeviceValueSourceRow,
} from "../lib/db";
import { publish } from "../lib/events";
import { badRequest, conflict, notFound } from "../lib/http";
import { emitDevicesChanged } from "./device-hooks";
import { checkDeviceIndicator } from "./device-notifications";

const toCategory = (row: DeviceCategoryRow) => row.toLowerCase() as DeviceCategory;
const fromCategory = (category: DeviceCategory) => category.toUpperCase() as DeviceCategoryRow;
const toSource = (row: DeviceValueSourceRow) => row.toLowerCase() as ValueSource;
const fromSource = (source: ValueSource) => source.toUpperCase() as DeviceValueSourceRow;

type ProfileRow = Prisma.DeviceProfileGetPayload<{ include: { _count: { select: { devices: true } } } }>;

function toProfile(row: ProfileRow): DeviceProfile {
  // Stored by this service only, after zod validation, so the JSON shapes are known.
  return {
    id: row.id,
    name: row.name,
    icon: row.icon as DeviceProfile["icon"],
    category: toCategory(row.category),
    fields: row.fields as DeviceProfile["fields"],
    primaryField: row.primaryField,
    rules: row.rules as DeviceProfile["rules"],
    fallbackTone: row.fallbackTone as IndicatorTone,
    fallbackLabel: row.fallbackLabel,
    staleAfterMinutes: row.staleAfterMinutes,
    presetKey: row.presetKey,
    deviceCount: row._count.devices,
  };
}

const deviceInclude = {
  place: { include: { floor: { select: { name: true } } } },
  appliance: { select: { id: true, name: true } },
  values: true,
  profile: { select: { fields: true } },
} as const satisfies Prisma.DeviceInclude;

type DeviceRow = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

function toBinding(row: DeviceRow["values"][number]): DeviceFieldBinding {
  return {
    fieldKey: row.fieldKey,
    source: toSource(row.source),
    haEntityId: row.haEntityId,
    haAttribute: row.haAttribute,
    value: (row.value as FieldValue | null) ?? null,
    updatedAt: row.valueAt?.toISOString() ?? null,
  };
}

function toDevice(row: DeviceRow): Device {
  const fields = row.profile.fields as DeviceProfile["fields"];
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    profileId: row.profileId,
    place: row.place
      ? {
          id: row.place.id,
          name: row.place.name,
          kind: row.place.kind === "ZONE" ? "zone" : "room",
          color: row.place.color,
          icon: row.place.icon,
          floorId: row.place.floorId,
          floorName: row.place.floor.name,
        }
      : null,
    floorId: row.floorId,
    position: row.floorId !== null && row.x !== null && row.y !== null ? { x: row.x, y: row.y } : null,
    appliance: row.appliance,
    values: bindingsForProfile({ fields }, row.values.map(toBinding)),
  };
}

const withCount = { _count: { select: { devices: true } } } as const;

function profileData(input: DeviceProfileData) {
  return {
    name: input.name,
    icon: input.icon,
    category: fromCategory(input.category),
    fields: input.fields as Prisma.InputJsonValue,
    primaryField: input.primaryField,
    rules: input.rules as Prisma.InputJsonValue,
    fallbackTone: input.fallbackTone,
    fallbackLabel: input.fallbackLabel ?? null,
    staleAfterMinutes: input.staleAfterMinutes,
  };
}

const changed = (householdId: string, event: DeviceChangedEvent) => {
  publish(householdId, DEVICE_CHANGED_EVENT, event);
  // Server-side listeners (the Home Assistant sync re-reads its bindings).
  emitDevicesChanged(householdId, event);
};

// Profiles ------------------------------------------------------------------------------------------------

export async function listProfiles(householdId: string): Promise<DeviceProfile[]> {
  const rows = await db.deviceProfile.findMany({ where: { householdId }, include: withCount, orderBy: { name: "asc" } });
  return rows.map(toProfile);
}

async function findProfile(householdId: string, id: string): Promise<ProfileRow> {
  const row = await db.deviceProfile.findFirst({ where: { id, householdId }, include: withCount });
  if (!row) throw notFound("Device profile not found");
  return row;
}

export async function getProfile(householdId: string, id: string): Promise<DeviceProfile> {
  return toProfile(await findProfile(householdId, id));
}

export async function createProfile(householdId: string, input: DeviceProfileData): Promise<DeviceProfile> {
  const row = await db.deviceProfile.create({
    data: { householdId, ...profileData(input), presetKey: input.presetKey ?? null },
    include: withCount,
  });
  changed(householdId, { deviceId: null, profileId: row.id, action: "created" });
  return toProfile(row);
}

export async function createProfileFromPreset(householdId: string, key: string, locale: "en" | "nl"): Promise<DeviceProfile> {
  const preset = devicePresetProfile(key, locale);
  if (!preset) throw notFound("Unknown preset");
  return createProfile(householdId, deviceProfileInputSchema.parse(preset));
}

export async function updateProfile(householdId: string, id: string, input: DeviceProfileData): Promise<DeviceProfile> {
  await findProfile(householdId, id);
  const keys = input.fields.map((field) => field.key);
  const [row] = await db.$transaction([
    db.deviceProfile.update({ where: { id }, data: profileData(input), include: withCount }),
    // Values of removed fields go with them.
    db.deviceFieldValue.deleteMany({ where: { device: { profileId: id, householdId }, fieldKey: { notIn: keys } } }),
  ]);
  changed(householdId, { deviceId: null, profileId: id, action: "updated" });
  return toProfile(row);
}

export async function deleteProfile(householdId: string, id: string): Promise<void> {
  const row = await findProfile(householdId, id);
  if (row._count.devices > 0) throw conflict("This profile is used by devices");
  await db.deviceProfile.delete({ where: { id } });
  changed(householdId, { deviceId: null, profileId: id, action: "deleted" });
}

// Devices -------------------------------------------------------------------------------------------------

export async function getDevicesOverview(householdId: string): Promise<DevicesOverview> {
  const [devices, profiles] = await Promise.all([
    db.device.findMany({ where: { householdId }, include: deviceInclude, orderBy: { name: "asc" } }),
    listProfiles(householdId),
  ]);
  return { devices: devices.map(toDevice), profiles };
}

async function findDevice(householdId: string, id: string): Promise<DeviceRow> {
  const row = await db.device.findFirst({ where: { id, householdId }, include: deviceInclude });
  if (!row) throw notFound("Device not found");
  return row;
}

export async function getDeviceDetail(householdId: string, id: string): Promise<DeviceDetail> {
  const row = await findDevice(householdId, id);
  return { device: toDevice(row), profile: await getProfile(householdId, row.profileId) };
}

/** Ids from the request must belong to the household; anything else is a 400 on that field. */
async function checkReferences(householdId: string, input: DeviceInput, deviceId?: string) {
  const [profile, place, appliance] = await Promise.all([
    db.deviceProfile.findFirst({ where: { id: input.profileId, householdId }, select: { id: true } }),
    input.placeId ? db.place.findFirst({ where: { id: input.placeId, householdId }, select: { id: true } }) : null,
    input.applianceId
      ? db.appliance.findFirst({ where: { id: input.applianceId, householdId }, select: { id: true, device: { select: { id: true } } } })
      : null,
  ]);
  if (!profile) throw badRequest("Validation failed", { profileId: ["Unknown profile"] });
  if (input.placeId && !place) throw badRequest("Validation failed", { placeId: ["Unknown place"] });
  if (input.applianceId && !appliance) throw badRequest("Validation failed", { applianceId: ["Unknown appliance"] });
  if (appliance?.device && appliance.device.id !== deviceId) {
    throw badRequest("Validation failed", { applianceId: ["This appliance is already linked to another device"] });
  }
}

export async function createDevice(householdId: string, input: DeviceInput): Promise<Device> {
  await checkReferences(householdId, input);
  const row = await db.device.create({
    data: {
      householdId,
      name: input.name,
      profileId: input.profileId,
      placeId: input.placeId ?? null,
      applianceId: input.applianceId ?? null,
      notes: input.notes ?? null,
    },
    include: deviceInclude,
  });
  changed(householdId, { deviceId: row.id, profileId: row.profileId, action: "created" });
  return toDevice(row);
}

export async function updateDevice(householdId: string, id: string, input: DeviceInput): Promise<Device> {
  const existing = await findDevice(householdId, id);
  await checkReferences(householdId, input, id);
  const profileChanged = existing.profileId !== input.profileId;
  const row = await db.$transaction(async (tx) => {
    if (profileChanged) await tx.deviceFieldValue.deleteMany({ where: { deviceId: id } });
    return tx.device.update({
      where: { id },
      data: {
        name: input.name,
        profileId: input.profileId,
        placeId: input.placeId ?? null,
        applianceId: input.applianceId ?? null,
        notes: input.notes ?? null,
      },
      include: deviceInclude,
    });
  });
  changed(householdId, { deviceId: id, profileId: row.profileId, action: "updated" });
  return toDevice(row);
}

export async function deleteDevice(householdId: string, id: string): Promise<void> {
  const row = await findDevice(householdId, id);
  await db.device.delete({ where: { id } });
  changed(householdId, { deviceId: id, profileId: row.profileId, action: "deleted" });
}

export async function setDevicePosition(householdId: string, id: string, input: DevicePositionInput): Promise<Device> {
  await findDevice(householdId, id);
  if (input.floorId) {
    const floor = await db.floor.findFirst({ where: { id: input.floorId, householdId }, select: { id: true } });
    if (!floor) throw badRequest("Validation failed", { floorId: ["Unknown floor"] });
  }
  const row = await db.device.update({ where: { id }, data: { floorId: input.floorId, x: input.x, y: input.y }, include: deviceInclude });
  changed(householdId, { deviceId: id, profileId: row.profileId, action: "updated" });
  return toDevice(row);
}

export async function setDeviceBindings(householdId: string, id: string, input: DeviceBindingsInput): Promise<Device> {
  const existing = await findDevice(householdId, id);
  const fields = existing.profile.fields as DeviceProfile["fields"];
  for (const binding of input.bindings) {
    if (!fields.some((field) => field.key === binding.fieldKey)) {
      throw badRequest("Validation failed", { bindings: [`Unknown field ${binding.fieldKey}`] });
    }
  }
  await db.$transaction(
    input.bindings.map((binding) => {
      const data = {
        source: fromSource(binding.source),
        haEntityId: binding.haEntityId || null,
        haAttribute: binding.haAttribute || null,
      };
      return db.deviceFieldValue.upsert({
        where: { deviceId_fieldKey: { deviceId: id, fieldKey: binding.fieldKey } },
        create: { deviceId: id, fieldKey: binding.fieldKey, ...data },
        update: data,
      });
    }),
  );
  changed(householdId, { deviceId: id, profileId: existing.profileId, action: "updated" });
  return toDevice(await findDevice(householdId, id));
}

/**
 * Sets one field's value and publishes `device.value`. `source: "manual"` (the UI) is refused for a field
 * bound to Home Assistant; the Home Assistant sync (phase 8) calls this with `source: "home_assistant"`.
 */
export async function setDeviceValue(
  householdId: string,
  id: string,
  fieldKey: string,
  raw: FieldValue,
  source: ValueSource = "manual",
): Promise<DeviceFieldBinding> {
  const device = await findDevice(householdId, id);
  const field = (device.profile.fields as DeviceProfile["fields"]).find((candidate) => candidate.key === fieldKey);
  if (!field) throw notFound("Unknown field");
  const value = coerceFieldValue(field, raw);
  if (value === undefined) throw badRequest("Validation failed", { value: ["This value does not fit the field"] });
  const current = device.values.find((row) => row.fieldKey === fieldKey);
  if (source === "manual" && current?.source === "HOME_ASSISTANT") {
    throw conflict("This value comes from Home Assistant");
  }
  const now = new Date();
  const json = value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
  const row = await db.deviceFieldValue.upsert({
    where: { deviceId_fieldKey: { deviceId: id, fieldKey } },
    create: { deviceId: id, fieldKey, source: fromSource(source), value: json, valueAt: now },
    update: { value: json, valueAt: now },
  });
  const binding = toBinding(row);
  publish<DeviceValueEvent>(householdId, DEVICE_VALUE_EVENT, {
    deviceId: id,
    fieldKey,
    value: binding.value,
    updatedAt: binding.updatedAt ?? now.toISOString(),
    source: binding.source,
  });
  // Indicator turned orange/red for someone who follows this device (docs/NOTIFICATIONS.md); not awaited.
  void checkDeviceIndicator(householdId, id);
  return binding;
}
