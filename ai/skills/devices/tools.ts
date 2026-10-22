import { z } from "zod";
import { listDevicePresets } from "@/features/devices/types/device-presets";
import { DEVICE_CATEGORIES, formatFieldValue, type Device, type DeviceProfile } from "@/features/devices/types/devices";
import { evaluateIndicator } from "@/features/devices/types/indicator";
import { PLAN_DIFF_KIND } from "@/features/places/types/plan-diff";
import { formatDateTime } from "@/types/date-format";
import { createDevice, createProfileFromPreset, deleteDevice, getDevicesOverview, setDevicePosition, setDeviceValue, updateDevice } from "@/api/devices/devices.service";
import { controlCall, controlEntity, listScenes, type ControlAction } from "@/api/home-assistant/ha-control";
import { connectionStatusFor, getEntityState } from "@/api/home-assistant/ha-connection";
import { db } from "@/api/lib/db";
import { HttpError } from "@/api/lib/http";
import { getFloorPlan } from "@/api/places/places.service";
import { pickCandidate } from "@ai/core/resolve";
import { capList, done, entityRef, registerAssistantSkill, registerAssistantTool, registerEntityResolver, registerScreenContext, say, type AssistantToolContext, type ResolvedEntity } from "@ai/core/kit";
import { boundsOf, docOf, planDiff, screenDirection, SIDES, sideEdge } from "../floorplan/plan-edit";
import { polygonCentroid } from "@/features/places/types/plan-geometry";

/**
 * Skill "devices": the household's devices (sensors, lights, thermostats, appliances' plugs) with their live
 * values, and switching the ones bound to Home Assistant (ha-control.ts decides what may be switched: never
 * doors, gates, locks or the alarm). Registers the `device` resolver.
 */

registerAssistantSkill({
  id: "devices",
  title: { en: "Devices", nl: "Toestellen" },
  summary: "Devices and sensors with their live state (open windows, temperatures, dryer); lights, switches, blinds, thermostats and scenes.",
  keywords: {
    nl: [
      "toestel", "apparaat", "sensor", "lamp", "licht", "lichten", "verlichting", "thermostaat", "verwarming", "rolluik", "gordijn", "zonnewering", "screen",
      "scène", "stopcontact", "schakelaar", "openstaan", "staat open", "ramen open", "raam open", "droogkast", "wasmachine", "poort", "garagepoort", "slot", "ontgrendel", "binnentemperatuur",
    ],
    en: ["device", "sensor", "light", "lamp", "thermostat", "heating", "blind", "shutter", "curtain", "scene", "switch", "plug", "socket", "dryer", "gate", "garage door", "lock", "unlock", "indoor temperature", "turn on", "turn off", "switch on", "switch off",
      "window open", "windows open", "open window", "door open", "doors open"],
  },
});

registerEntityResolver({
  type: "device",
  label: "device",
  skill: "devices",
  list: async (ctx) => {
    const { devices } = await getDevicesOverview(ctx.householdId);
    return devices.map((device) => ({ id: device.id, name: device.name, hint: device.place?.name, data: { placeId: device.place?.id ?? null } }));
  },
});

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────

/** "Open (warning)" / "21,5 °C" / "unknown": the device's indicator in a few words. */
function stateText(device: Device, profile: DeviceProfile | undefined, locale: "en" | "nl"): string {
  if (!profile) return "?";
  const values = Object.fromEntries(device.values.map((binding) => [binding.fieldKey, { value: binding.value, updatedAt: binding.updatedAt, source: binding.source }]));
  const result = evaluateIndicator(profile, values);
  const primary = result.primary ? formatFieldValue(result.primary.field, result.primary.value, locale) : null;
  const label = result.label ?? (result.stale ? "no recent data" : result.unknown ? "unknown" : null);
  const tone = result.tone === "warning" || result.tone === "danger" ? ` (${result.tone})` : "";
  return [label, primary && primary !== label ? primary : null].filter(Boolean).join(", ") + tone || "unknown";
}

const CONTROLLABLE = /^(light|switch|fan|cover|climate)\./;

/** The Home Assistant entity a device can be switched through, if any. */
function controlEntityOf(device: Device): string | null {
  return device.values.find((binding) => binding.source === "home_assistant" && binding.haEntityId && CONTROLLABLE.test(binding.haEntityId))?.haEntityId ?? null;
}

registerAssistantTool({
  name: "devices.list",
  description: "Devices with their current state, e.g. which windows are open, temperatures, whether the dryer runs. Filter by room or category, or only those needing attention.",
  input: z.object({
    room: entityRef("place").optional(),
    category: z.enum(DEVICE_CATEGORIES).optional(),
    attention: z.boolean().default(false).describe("Only warnings and alarms"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the devices", nl: "Toestellen bekeken" },
  run: async (ctx, input) => {
    const [{ devices, profiles }, status] = await Promise.all([getDevicesOverview(ctx.householdId), connectionStatusFor(ctx.householdId)]);
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    const rows = devices
      .filter((device) => !input.room || device.place?.id === input.room.id)
      .filter((device) => !input.category || byId.get(device.profileId)?.category === input.category)
      .map((device) => ({ device, text: stateText(device, byId.get(device.profileId), ctx.locale) }))
      .filter((row) => !input.attention || /\((warning|danger)\)$/.test(row.text));
    return {
      homeAssistant: status.linked ? status.state : null,
      ...capList(rows, 40, ({ device, text }) => `${device.name}${device.place ? ` (${device.place.name})` : ""}: ${text}${controlEntityOf(device) ? " [switchable]" : ""}`),
    };
  },
});

registerAssistantTool({
  name: "devices.status",
  description: "One device in detail: every value with when it changed and where it comes from, its room, linked appliance, notes, whether it can be switched.",
  input: z.object({ device: entityRef("device") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at a device", nl: "Toestel bekeken" },
  run: async (ctx, input) => {
    const { devices, profiles } = await getDevicesOverview(ctx.householdId);
    const device = devices.find((candidate) => candidate.id === input.device.id)!;
    const profile = profiles.find((candidate) => candidate.id === device.profileId);
    return {
      name: device.name,
      type: profile?.name,
      room: device.place ? `${device.place.name} (${device.place.floorName})` : null,
      onPlan: device.position !== null,
      state: stateText(device, profile, ctx.locale),
      values: device.values.map((binding) => {
        const field = profile?.fields.find((candidate) => candidate.key === binding.fieldKey);
        const value = field ? formatFieldValue(field, binding.value, ctx.locale) : String(binding.value);
        const when = binding.updatedAt ? formatDateTime(binding.updatedAt, ctx.locale) : null;
        return `${field?.label ?? binding.fieldKey}: ${value ?? "unknown"}${when ? ` (${when})` : ""}${binding.source === "manual" ? " [manual]" : ""}`;
      }),
      appliance: device.appliance?.name,
      notes: device.notes,
      switchable: Boolean(controlEntityOf(device)),
    };
  },
});

// ── Values and switching ────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "devices.set_value",
  description: "Set a manually kept value of a device (e.g. a window that has no sensor: open/closed). Values from Home Assistant can't be set.",
  input: z.object({
    device: entityRef("device"),
    field: z.string().trim().min(1).max(60).describe("Field label or key, e.g. 'Open'"),
    value: z.union([z.boolean(), z.number(), z.string().max(200)]),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Set a device value", nl: "Waarde van een toestel ingesteld" },
  describe: (ctx, input) => say(ctx.locale, `Set ${input.field} of ${input.device.name} to ${String(input.value)}`, `${input.field} van ${input.device.name} op ${String(input.value)} zetten`),
  run: async (ctx, input) => {
    const { devices, profiles } = await getDevicesOverview(ctx.householdId);
    const device = devices.find((candidate) => candidate.id === input.device.id)!;
    const fields = profiles.find((profile) => profile.id === device.profileId)?.fields ?? [];
    const wanted = input.field.toLowerCase();
    const field = fields.find((candidate) => candidate.key.toLowerCase() === wanted || candidate.label.toLowerCase() === wanted) ?? (fields.length === 1 ? fields[0] : undefined);
    if (!field) return { ok: false, error: `Which field? ${fields.map((candidate) => candidate.label).join(", ")}.` };
    await setDeviceValue(ctx.householdId, device.id, field.key, input.value);
    return done(`${device.name}: ${field.label} is now ${formatFieldValue(field, input.value as never, "en") ?? String(input.value)}.`);
  },
});

const SWITCH_NL: Record<string, string> = { on: "aanzetten", off: "uitzetten", open: "openen", close: "sluiten", brightness: "dimmen", position: "op stand zetten" };

/** An HttpError 400 reaches the model as this message (and, from a preview, stops the confirmation card). */
function failWith(message: string): never {
  throw new HttpError(400, "bad_request", message);
}

async function switchable(ctx: AssistantToolContext, ref: ResolvedEntity) {
  const { devices } = await getDevicesOverview(ctx.householdId);
  const device = devices.find((candidate) => candidate.id === ref.id)!;
  const entityId = controlEntityOf(device);
  if (!entityId) failWith(`${device.name} can't be switched: it isn't linked to a Home Assistant light, switch, blind or thermostat.`);
  return { device, entityId: entityId! };
}

registerAssistantTool({
  name: "devices.switch",
  description: "Switch a device through Home Assistant: a light, switch or fan on/off, a light's brightness %, a blind/shutter/curtain open/close/position %. Never doors, gates, locks or the alarm.",
  input: z.object({
    device: entityRef("device"),
    action: z.enum(["on", "off", "open", "close", "brightness", "position"]),
    value: z.number().min(0).max(100).optional().describe("Percent, for brightness or position"),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Switched a device", nl: "Toestel geschakeld" },
  describe: (ctx, input) =>
    say(ctx.locale, `${input.action} ${input.device.name}${input.value !== undefined ? ` (${input.value}%)` : ""}`, `${input.device.name} ${SWITCH_NL[input.action]}${input.value !== undefined ? ` (${input.value}%)` : ""}`),
  preview: async (ctx, input) => {
    // Checks the safety rules and that the action fits before the person is asked; no picture needed.
    const { entityId } = await switchable(ctx, input.device);
    const state = getEntityState(entityId);
    if (state) {
      const call = controlCall(state, { action: input.action as ControlAction, value: input.value });
      if (typeof call === "string") failWith(call);
    }
    return null;
  },
  run: async (ctx, input) => {
    const { device, entityId } = await switchable(ctx, input.device);
    const result = await controlEntity(ctx.householdId, entityId, { action: input.action as ControlAction, value: input.value });
    return done(`${device.name}: ${input.action}${input.value !== undefined ? ` ${input.value}%` : ""} sent.`, { state: result.state });
  },
});

registerAssistantTool({
  name: "devices.climate",
  description: "Set a thermostat's target temperature (°C), or turn the heating/airco of one thermostat on or off, through Home Assistant.",
  input: z.object({
    device: entityRef("device"),
    temperature: z.number().min(5).max(30).optional(),
    power: z.enum(["on", "off"]).optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed the heating", nl: "Verwarming aangepast" },
  describe: (ctx, input) =>
    input.temperature !== undefined
      ? say(ctx.locale, `Set ${input.device.name} to ${input.temperature} °C`, `${input.device.name} op ${String(input.temperature).replace(".", ",")} °C zetten`)
      : say(ctx.locale, `Turn ${input.device.name} ${input.power ?? "on"}`, `${input.device.name} ${input.power === "off" ? "uitzetten" : "aanzetten"}`),
  preview: async (ctx, input) => {
    const { entityId } = await switchable(ctx, input.device);
    if (!entityId.startsWith("climate.")) failWith(`${input.device.name} is not a thermostat.`);
    if (input.temperature === undefined && !input.power) failWith("Give temperature or power.");
    return null;
  },
  run: async (ctx, input) => {
    const { device, entityId } = await switchable(ctx, input.device);
    if (!entityId.startsWith("climate.")) failWith(`${device.name} is not a thermostat.`);
    if (input.power) await controlEntity(ctx.householdId, entityId, { action: input.power });
    if (input.temperature !== undefined) await controlEntity(ctx.householdId, entityId, { action: "temperature", value: input.temperature });
    return done(`${device.name}: ${input.temperature !== undefined ? `${input.temperature} °C` : `turned ${input.power}`}.`);
  },
});

registerAssistantTool({
  name: "devices.scene",
  description: "Run a Home Assistant scene by name (e.g. 'Film', 'Avond'). Without a name: lists the scenes.",
  input: z.object({ scene: z.string().trim().max(80).optional() }),
  permission: "write",
  confirm: "always",
  activity: { en: "Ran a scene", nl: "Scène gestart" },
  describe: (ctx, input) => say(ctx.locale, `Run the scene “${input.scene ?? "?"}”`, `De scène “${input.scene ?? "?"}” starten`),
  preview: async (ctx, input) => {
    await sceneOf(ctx, input.scene);
    return null;
  },
  run: async (ctx, input) => {
    const scene = await sceneOf(ctx, input.scene);
    await controlEntity(ctx.householdId, scene.id, { action: "on" });
    return done(`Scene ${scene.name} started.`);
  },
});

async function sceneOf(ctx: AssistantToolContext, name: string | undefined) {
  const scenes = await listScenes(ctx.householdId);
  if (!scenes.length) failWith("There are no scenes (or Home Assistant is not connected).");
  if (!name) failWith(`Which scene? ${scenes.map((scene) => scene.name).join(", ")}.`);
  const outcome = pickCandidate("device", "scene", name!, scenes.map((scene) => ({ id: scene.entityId, name: scene.name })), true);
  if (!outcome.ok) failWith(outcome.error);
  return outcome.entity;
}

// ── Managing devices ────────────────────────────────────────────────────────────────────────────────

const SPOTS = ["center", ...SIDES] as const;

registerAssistantTool({
  name: "devices.place",
  description: "Put a device in a room and (by default) on that floor's plan, at the room's centre or against one side.",
  input: z.object({
    device: entityRef("device"),
    room: entityRef("place"),
    onPlan: z.boolean().default(true),
    spot: z.enum(SPOTS).default("center").describe("Where in the room on the plan"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Placed a device", nl: "Toestel geplaatst" },
  describe: (ctx, input) => say(ctx.locale, `Put ${input.device.name} in ${input.room.name}`, `${input.device.name} in ${input.room.name} zetten`),
  preview: async (ctx, input) => {
    if (!input.onPlan) return null;
    const { plan, at } = await spotOf(ctx, input.room, input.spot);
    if (!at) return null;
    const doc = docOf(plan);
    return { kind: PLAN_DIFF_KIND, title: plan.floor.name, data: planDiff(plan.floor.name, doc, doc, [{ name: input.device.name, at, state: "added" }]) };
  },
  run: async (ctx, input) => {
    const { devices } = await getDevicesOverview(ctx.householdId);
    const device = devices.find((candidate) => candidate.id === input.device.id)!;
    await updateDevice(ctx.householdId, device.id, { name: device.name, profileId: device.profileId, placeId: input.room.id, applianceId: device.appliance?.id ?? null, notes: device.notes });
    if (input.onPlan) {
      const { plan, at } = await spotOf(ctx, input.room, input.spot);
      if (at) await setDevicePosition(ctx.householdId, device.id, { floorId: plan.floor.id, x: at[0], y: at[1] });
      return done(`${device.name} is in ${input.room.name}${at ? " and on the plan" : " (the room isn't drawn, so not on the plan)"}.`);
    }
    return done(`${device.name} is in ${input.room.name}.`);
  },
});

/** A point in the room: its centre, or 40 cm inside the middle of one side. */
async function spotOf(ctx: AssistantToolContext, room: ResolvedEntity, spot: (typeof SPOTS)[number]) {
  const plan = await getFloorPlan(ctx.householdId, String(room.data?.floorId ?? ""));
  const polygon = plan.places.find((place) => place.id === room.id)?.polygon;
  if (!polygon) return { plan, at: null };
  if (spot === "center") {
    const centre = polygonCentroid(polygon);
    return { plan, at: [Math.round(centre.x), Math.round(centre.y)] as [number, number] };
  }
  const bounds = boundsOf(polygon)!;
  const direction = screenDirection(spot, plan.north);
  const edge = sideEdge(bounds, direction);
  const middle = Math.round((edge.from + edge.to) / 2);
  const inset = direction === "up" || direction === "left" ? 40 : -40;
  const at: [number, number] = direction === "up" || direction === "down" ? [middle, edge.fixed + inset] : [edge.fixed + inset, middle];
  return { plan, at };
}

registerAssistantTool({
  name: "devices.add",
  description: "Add a device with manual values, of an existing type (profile) or a standard one (window/door contact, temperature, washer/dryer, light, motion, smoke…), optionally in a room.",
  input: z.object({ name: z.string().trim().min(1).max(60), type: z.string().trim().min(1).max(60).describe("Device type, e.g. 'Raamcontact', 'Temperatuur'"), room: entityRef("place").optional() }),
  permission: "write",
  confirm: "always",
  activity: { en: "Added a device", nl: "Toestel toegevoegd" },
  describe: (ctx, input) => say(ctx.locale, `Add the device “${input.name}” (${input.type})${input.room ? ` in ${input.room.name}` : ""}`, `Het toestel “${input.name}” (${input.type}) toevoegen${input.room ? ` in ${input.room.name}` : ""}`),
  run: async (ctx, input) => {
    const { profiles } = await getDevicesOverview(ctx.householdId);
    const presets = listDevicePresets(ctx.locale);
    const candidates = [
      ...profiles.map((profile) => ({ id: `profile:${profile.id}`, name: profile.name })),
      ...presets.filter((preset) => !profiles.some((profile) => profile.presetKey === preset.key)).map((preset) => ({ id: `preset:${preset.key}`, name: preset.name, aliases: [preset.key] })),
    ];
    const outcome = pickCandidate("device", "device type", input.type, candidates, true);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    const [kind, key] = outcome.entity.id.split(":") as ["profile" | "preset", string];
    const profileId = kind === "profile" ? key : (await createProfileFromPreset(ctx.householdId, key, ctx.locale)).id;
    const device = await createDevice(ctx.householdId, { name: input.name, profileId, placeId: input.room?.id ?? null });
    return done(`Added ${device.name} (${outcome.entity.name})${input.room ? ` in ${input.room.name}` : ""}. Link it to Home Assistant in the app if it has a sensor.`, { id: device.id });
  },
});

registerAssistantTool({
  name: "devices.update",
  description: "Rename a device, move it to another room (or none), or change its notes.",
  input: z.object({
    device: entityRef("device"),
    name: z.string().trim().min(1).max(60).optional(),
    room: entityRef("place").optional(),
    noRoom: z.boolean().default(false),
    notes: z.string().trim().max(500).optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a device", nl: "Toestel aangepast" },
  describe: (ctx, input) => say(ctx.locale, `Change the device ${input.device.name}`, `Het toestel ${input.device.name} aanpassen`),
  run: async (ctx, input) => {
    const { devices } = await getDevicesOverview(ctx.householdId);
    const device = devices.find((candidate) => candidate.id === input.device.id)!;
    const saved = await updateDevice(ctx.householdId, device.id, {
      name: input.name ?? device.name,
      profileId: device.profileId,
      placeId: input.noRoom ? null : (input.room?.id ?? device.place?.id ?? null),
      applianceId: device.appliance?.id ?? null,
      notes: input.notes ?? device.notes,
    });
    return done(`Saved ${saved.name}${saved.place ? ` (${saved.place.name})` : ""}.`);
  },
});

registerAssistantTool({
  name: "devices.delete",
  description: "Delete a device (its values and history go with it).",
  input: z.object({ device: entityRef("device") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a device", nl: "Toestel verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the device ${input.device.name}`, `Het toestel ${input.device.name} verwijderen`),
  run: async (ctx, input) => {
    await deleteDevice(ctx.householdId, input.device.id);
    return done(`Deleted ${input.device.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a device's page and the devices overview ──

registerScreenContext({
  kind: "device",
  skills: ["devices"],
  describe: async (ctx, id) => {
    const device = id
      ? await db.device.findFirst({ where: { id, householdId: ctx.householdId }, select: { name: true, profile: { select: { name: true } }, place: { select: { name: true } } } })
      : null;
    return device && { label: device.name, summary: `device "${device.name}" (${device.profile.name}${device.place ? `, in "${device.place.name}"` : ""})` };
  },
});

registerScreenContext({
  kind: "devices",
  skills: ["devices"],
  describe: (ctx) => ({ label: say(ctx.locale, "Devices", "Toestellen"), summary: "the devices overview" }),
});
