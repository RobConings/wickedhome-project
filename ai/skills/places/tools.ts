import { z } from "zod";
import { floorPlanInputSchema, PLACE_COLORS } from "@/features/places/types/places";
import { PLAN_DIFF_KIND } from "@/features/places/types/plan-diff";
import { listLinkedFiles } from "@/api/documents/documents.service";
import { getDevicesOverview } from "@/api/devices/devices.service";
import { listAppliances } from "@/api/energy/energy.service";
import { db } from "@/api/lib/db";
import {
  createFloor,
  createPlace,
  deleteFloor,
  deletePlace,
  getFloorPlan,
  getPlacesOverview,
  saveFloorPlan,
  updateFloor,
  updatePlace,
} from "@/api/places/places.service";
import { fold } from "@ai/core/text-match";
import { capList, done, entityRef, registerAssistantContext, registerAssistantSkill, registerAssistantTool, registerEntityResolver, registerScreenContext, round, say } from "@ai/core/kit";
import { boundsOf, docOf, neighbours, planDiff, sizeOf, sizeText } from "../floorplan/plan-edit";

/**
 * Skill "places": floors, rooms and outdoor zones as data (names, floors, colours, what is in a room). The
 * drawing tools are the "floorplan" skill. Registers the `place` and `floor` resolvers and the "Rooms:"
 * snapshot line.
 */

registerAssistantSkill({
  id: "places",
  title: { en: "Rooms and floor plans", nl: "Ruimtes en plannen" },
  summary: "Floors, rooms and outdoor zones: sizes, what is in a room, adding, renaming, moving and deleting them.",
  keywords: {
    nl: [
      "kamer", "ruimte", "verdieping", "gelijkvloers", "zolder", "kelder", "tuin",
      "keuken", "badkamer", "slaapkamer", "woonkamer", "living", "bureau", "garage", "hoe groot", "oppervlakte", "vierkante meter", "hernoem",
    ],
    en: ["room", "floor", "storey", "attic", "basement", "garden", "zone", "kitchen", "bathroom", "bedroom", "office", "how big", "area", "square metre", "rename"],
  },
});

/** Other words people use for common rooms, so "de living" finds the Woonkamer and the other way round. */
const ROOM_SYNONYMS: string[][] = [
  ["woonkamer", "living", "zitkamer", "salon", "living room"],
  ["keuken", "kitchen"],
  ["badkamer", "bathroom"],
  ["slaapkamer", "bedroom"],
  ["bureau", "office", "werkkamer"],
  ["toilet", "wc"],
  ["inkomhal", "hal", "hall", "gang"],
  ["berging", "storage", "bergruimte"],
  ["tuin", "garden"],
];
export function roomAliases(name: string): string[] {
  const folded = fold(name);
  return ROOM_SYNONYMS.flatMap((group) => {
    const hit = group.find((word) => folded === word || folded.startsWith(`${word} `));
    return hit ? group.filter((word) => word !== hit).map((word) => folded.replace(hit, word)) : [];
  });
}

registerEntityResolver({
  type: "place",
  label: "room or zone",
  skill: "places",
  list: async (ctx) => {
    const { places } = await getPlacesOverview(ctx.householdId);
    return places.map((place) => ({ id: place.id, name: place.name, aliases: roomAliases(place.name), hint: place.floorName, data: { floorId: place.floorId, kind: place.kind } }));
  },
});

registerEntityResolver({
  type: "floor",
  label: "floor",
  skill: "places",
  list: async (ctx) => {
    const { floors } = await getPlacesOverview(ctx.householdId);
    return floors.map((floor) => ({ id: floor.id, name: floor.name, hint: floor.kind === "outdoor" ? "outdoor" : `level ${floor.level}`, data: { level: floor.level, kind: floor.kind } }));
  },
});

registerAssistantContext({
  id: "rooms",
  order: 20,
  build: async (ctx) => {
    const { floors, places } = await getPlacesOverview(ctx.householdId);
    if (!places.length) return null;
    const perFloor = floors
      .map((floor) => {
        const names = places.filter((place) => place.floorId === floor.id).map((place) => place.name);
        return names.length ? `${floor.name}: ${names.join(", ")}` : null;
      })
      .filter(Boolean);
    return `Rooms: ${perFloor.join("; ")}.`;
  },
});

const sizeOfPolygon = (polygon: { x: number; y: number }[] | null) => {
  if (!polygon) return null;
  const { width, depth } = sizeOf(boundsOf(polygon)!);
  return sizeText(width, depth);
};

// ── Read ────────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "places.rooms",
  description: "Floors with their rooms and outdoor zones, with each room's area (m²) and size when its outline is drawn.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the rooms", nl: "Ruimtes bekeken" },
  run: async (ctx) => {
    const { floors, places } = await getPlacesOverview(ctx.householdId);
    return {
      floors: floors.map((floor) => ({
        floor: floor.name,
        kind: floor.kind,
        level: floor.level,
        rooms: places.filter((place) => place.floorId === floor.id).map((place) => (place.polygon ? `${place.name} ${round(place.areaM2)} m² (${sizeOfPolygon(place.polygon)})` : `${place.name} (not drawn)`)),
      })),
    };
  },
});

registerAssistantTool({
  name: "places.room",
  description: "One room or zone: floor, area, size, neighbours, and what is in it (devices, appliances, documents).",
  input: z.object({ room: entityRef("place") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at a room", nl: "Ruimte bekeken" },
  run: async (ctx, input) => {
    const floorId = String(input.room.data?.floorId ?? "");
    const [plan, { devices }, appliances, files] = await Promise.all([
      getFloorPlan(ctx.householdId, floorId),
      getDevicesOverview(ctx.householdId),
      listAppliances(ctx.householdId),
      listLinkedFiles(ctx.householdId, { entityType: "place", entityId: input.room.id }),
    ]);
    const place = plan.places.find((candidate) => candidate.id === input.room.id);
    const doc = docOf(plan);
    return {
      name: input.room.name,
      floor: plan.floor.name,
      m2: place?.areaM2 ?? null,
      size: sizeOfPolygon(place?.polygon ?? null) ?? "not drawn",
      nextTo: neighbours(doc, input.room.id),
      devices: capList(devices.filter((device) => device.place?.id === input.room.id), 15, (device) => device.name),
      appliances: capList(appliances.filter((appliance) => appliance.placeId === input.room.id), 15, (appliance) => appliance.name),
      documents: capList(files, 10, (file) => file.name),
    };
  },
});

// ── Rooms ───────────────────────────────────────────────────────────────────────────────────────────

const colorSchema = z.enum(PLACE_COLORS).optional().describe("Colour on the plan; default the next free one");

registerAssistantTool({
  name: "places.add_room",
  description: "Add a room (or outdoor zone) to a floor without drawing it. To draw it with a size, use floorplan_draw_room instead.",
  input: z.object({ name: z.string().trim().min(1).max(60), floor: entityRef("floor"), color: colorSchema }),
  permission: "write",
  confirm: "always",
  activity: { en: "Added a room", nl: "Ruimte toegevoegd" },
  describe: (ctx, input) => say(ctx.locale, `Add the room “${input.name}” on ${input.floor.name}`, `De ruimte “${input.name}” toevoegen op ${input.floor.name}`),
  run: async (ctx, input) => {
    const { places } = await getPlacesOverview(ctx.householdId);
    const used = new Set(places.map((place) => place.color.toLowerCase()));
    const color = input.color ?? PLACE_COLORS.find((candidate) => !used.has(candidate)) ?? PLACE_COLORS[0];
    const place = await createPlace(ctx.householdId, { name: input.name, floorId: input.floor.id, color, icon: null });
    return done(`Added ${place.name} on ${place.floorName}.`, { id: place.id });
  },
});

registerAssistantTool({
  name: "places.update_room",
  description: "Rename a room, give it another colour or icon (emoji), or move it to another floor (its drawing stays on the old floor's plan and is removed).",
  input: z.object({
    room: entityRef("place"),
    name: z.string().trim().min(1).max(60).optional(),
    floor: entityRef("floor").optional(),
    color: colorSchema,
    icon: z.string().trim().max(8).optional().describe("One emoji"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a room", nl: "Ruimte aangepast" },
  describe: (ctx, input) => {
    const changes = [input.name && `→ “${input.name}”`, input.floor && `→ ${input.floor.name}`, input.color, input.icon].filter(Boolean).join(", ");
    return say(ctx.locale, `Change ${input.room.name}: ${changes}`, `${input.room.name} aanpassen: ${changes}`);
  },
  run: async (ctx, input) => {
    const { places } = await getPlacesOverview(ctx.householdId);
    const current = places.find((place) => place.id === input.room.id)!;
    const place = await updatePlace(ctx.householdId, current.id, {
      name: input.name ?? current.name,
      floorId: input.floor?.id ?? current.floorId,
      color: input.color ?? current.color,
      icon: input.icon ?? current.icon,
    });
    return done(`${current.name} is now “${place.name}” on ${place.floorName}.`, { id: place.id });
  },
});

registerAssistantTool({
  name: "places.delete_room",
  description: "Delete a room or zone (things linked to it lose their room), or with onlyDrawing erase just its outline on the plan.",
  input: z.object({ room: entityRef("place"), onlyDrawing: z.boolean().default(false) }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a room", nl: "Ruimte verwijderd" },
  describe: (ctx, input) =>
    input.onlyDrawing
      ? say(ctx.locale, `Erase the drawing of ${input.room.name} (the room stays)`, `De tekening van ${input.room.name} wissen (de ruimte blijft)`)
      : say(ctx.locale, `Delete the room ${input.room.name}`, `De ruimte ${input.room.name} verwijderen`),
  preview: async (ctx, input) => {
    const plan = await getFloorPlan(ctx.householdId, String(input.room.data?.floorId ?? ""));
    const before = docOf(plan);
    if (!before.places.find((place) => place.id === input.room.id)?.polygon) return null;
    const after = input.onlyDrawing
      ? { ...before, places: before.places.map((place) => (place.id === input.room.id ? { ...place, polygon: null } : place)) }
      : { ...before, places: before.places.filter((place) => place.id !== input.room.id) };
    return { kind: PLAN_DIFF_KIND, title: plan.floor.name, data: planDiff(plan.floor.name, before, after) };
  },
  run: async (ctx, input) => {
    if (!input.onlyDrawing) {
      await deletePlace(ctx.householdId, input.room.id);
      return done(`Deleted ${input.room.name}.`);
    }
    const plan = await getFloorPlan(ctx.householdId, String(input.room.data?.floorId ?? ""));
    const place = plan.places.find((candidate) => candidate.id === input.room.id)!;
    await saveFloorPlan(
      ctx.householdId,
      plan.floor.id,
      floorPlanInputSchema.parse({
        gridSize: plan.floor.gridSize,
        places: [{ id: place.id, name: place.name, color: place.color, icon: place.icon, polygon: null }],
        elements: plan.elements,
      }),
    );
    return done(`Erased the drawing of ${place.name}; the room stays.`);
  },
});

// ── Floors ──────────────────────────────────────────────────────────────────────────────────────────

const floorKind = z.enum(["indoor", "outdoor"]);

registerAssistantTool({
  name: "places.add_floor",
  description: "Add a floor (level: 0 ground floor, 1 first floor, -1 basement) or an outdoor plan.",
  input: z.object({ name: z.string().trim().min(1).max(60), level: z.number().int().min(-10).max(50), kind: floorKind.default("indoor") }),
  permission: "write",
  confirm: "always",
  activity: { en: "Added a floor", nl: "Verdieping toegevoegd" },
  describe: (ctx, input) => say(ctx.locale, `Add the floor “${input.name}” (level ${input.level})`, `De verdieping “${input.name}” toevoegen (niveau ${input.level})`),
  run: async (ctx, input) => {
    const floor = await createFloor(ctx.householdId, input);
    return done(`Added the floor ${floor.name}.`, { id: floor.id });
  },
});

registerAssistantTool({
  name: "places.update_floor",
  description: "Rename a floor, change its level, or switch it between indoor and outdoor (rooms become zones and back).",
  input: z.object({ floor: entityRef("floor"), name: z.string().trim().min(1).max(60).optional(), level: z.number().int().min(-10).max(50).optional(), kind: floorKind.optional() }),
  permission: "write",
  confirm: "always",
  activity: { en: "Changed a floor", nl: "Verdieping aangepast" },
  describe: (ctx, input) => say(ctx.locale, `Change the floor ${input.floor.name}`, `De verdieping ${input.floor.name} aanpassen`),
  run: async (ctx, input) => {
    const { floors } = await getPlacesOverview(ctx.householdId);
    const current = floors.find((floor) => floor.id === input.floor.id)!;
    const floor = await updateFloor(ctx.householdId, current.id, { name: input.name ?? current.name, level: input.level ?? current.level, kind: input.kind ?? current.kind });
    return done(`Saved the floor ${floor.name}.`, { id: floor.id });
  },
});

registerAssistantTool({
  name: "places.delete_floor",
  description: "Delete an empty floor (one with rooms can't be deleted: move or delete its rooms first).",
  input: z.object({ floor: entityRef("floor") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a floor", nl: "Verdieping verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the floor ${input.floor.name}`, `De verdieping ${input.floor.name} verwijderen`),
  run: async (ctx, input) => {
    await deleteFloor(ctx.householdId, input.floor.id);
    return done(`Deleted the floor ${input.floor.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a room's page and the places overview ──

registerScreenContext({
  kind: "place",
  skills: ["places"],
  describe: async (ctx, id) => {
    const place = id
      ? await db.place.findFirst({ where: { id, householdId: ctx.householdId }, select: { name: true, kind: true, floor: { select: { name: true } } } })
      : null;
    return place && { label: place.name, summary: `room "${place.name}" (${place.kind.toLowerCase()}, floor "${place.floor.name}")` };
  },
});

registerScreenContext({
  kind: "places",
  skills: ["places"],
  describe: (ctx) => ({ label: say(ctx.locale, "Places", "Plaatsen"), summary: "the places overview (floors and rooms)" }),
});
