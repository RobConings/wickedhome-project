import { z } from "zod";
import { floorPlanInputSchema, PLACE_COLORS, type FloorPlan } from "@/features/places/types/places";
import { PLAN_DIFF_KIND, type PlanDiffData } from "@/features/places/types/plan-diff";
import { getFloorPlan, getPlacesOverview, saveFloorPlan } from "@/api/places/places.service";
import { fold } from "@ai/core/text-match";
import { done, entityRef, registerAssistantSkill, registerAssistantTool, registerScreenContext, say, type AssistantPreview, type AssistantToolContext, type ResolvedEntity } from "@ai/core/kit";
import {
  addOpening,
  addWalls,
  boundsOf,
  changedPlaces,
  checkOverlaps,
  changeOpening,
  defaultWallThickness,
  docOf,
  findPlace,
  fromTuples,
  metres,
  moveRoom,
  outlineOf,
  placeBeside,
  planDiff,
  planSummary,
  PlanEditError,
  rectPoints,
  relationText,
  relationTextNl,
  resizeSide,
  screenDirection,
  sideNl,
  SIDES,
  sizeOf,
  sizeText,
  type EditDoc,
  type ScreenDirection,
  type Side,
} from "./plan-edit";
import { editGeometry, geometryEditFields, geometryOf } from "./geometry-edit";
import { isSimplePolygon } from "@/features/places/types/polygon-geometry";
import { planOverlaps } from "@/features/places/types/plan-diagnostics";

/**
 * Skill "floorplan": reading and drawing the floor plans. Every drawing tool is a write that always asks, with
 * a `plan-diff` preview (the floor before/after, drawn by the places feature's renderer on the confirmation
 * card); "Apply" is the confirmation. The maths is in plan-edit.ts; saving goes through `saveFloorPlan`,
 * validated by the same schema as the editor's save. Results are one sentence, never geometry.
 */

registerAssistantSkill({
  id: "floorplan",
  title: { en: "Drawing floor plans", nl: "Plannen tekenen" },
  summary: "Draw and repair floor plans: exact room polygons, wall segments and attached openings; fill rooms from walls; report overlaps.",
  keywords: {
    nl: [
      "teken", "tekenen", "teken een", "grondplan", "plattegrond", "plan", "muur", "muren", "deur", "raam", "ramen", "venster", "vergroot", "verklein", "verplaats", "breder", "smaller", "langer",
      "noorden", "noordkant", "oostkant", "zuidkant", "westkant", "noordmuur", "oostmuur", "zuidmuur", "westmuur",
    ],
    // Not a bare "door": in Dutch it means "by" ("gegenereerd door mijn assistent" routed here).
    en: ["draw", "draw a", "floor plan", "floorplan", "wall", "a door", "the door", "window", "resize", "enlarge", "wider", "north", "north side", "east side", "south side", "west side"],
  },
});

// ── Shared ──────────────────────────────────────────────────────────────────────────────────────────

const cm = (label: string) => z.number().min(20).max(10_000).describe(label);
const sideSchema = z.enum(SIDES);
const coordinate = z.number().min(-100_000).max(100_000);
const allowOverlaps = geometryEditFields.allowOverlaps;

type Loaded = { plan: FloorPlan; floorId: string; before: EditDoc };

async function loadFloor(ctx: AssistantToolContext, floorId: string): Promise<Loaded> {
  const plan = await getFloorPlan(ctx.householdId, floorId);
  return { plan, floorId, before: docOf(plan) };
}

const floorOf = (place: ResolvedEntity) => String(place.data?.floorId ?? "");
const directionOf = (side: Side, loaded: Loaded): ScreenDirection => screenDirection(side, loaded.plan.north);

/** One computed drawing change: the plan after it, the result sentence (English, for the model) and the card text. */
type Edit = { loaded: Loaded; after: EditDoc; summary: string; card: { en: string; nl: string }; markers?: PlanDiffData["markers"]; north?: number | null };

/** The preview of an edit: the floor before/after. */
function previewOf(ctx: AssistantToolContext, edit: Edit): AssistantPreview {
  return {
    kind: PLAN_DIFF_KIND,
    title: edit.loaded.plan.floor.name,
    data: planDiff(edit.loaded.plan.floor.name, edit.loaded.before, edit.after, edit.markers),
  };
}

/** Saves an edit like the editor's Save: changed rooms, every element, the floor's grid (and north when set). */
async function save(ctx: AssistantToolContext, edit: Edit) {
  const { loaded, after } = edit;
  const input = floorPlanInputSchema.parse({
    gridSize: loaded.plan.floor.gridSize,
    places: changedPlaces(loaded.before, after),
    elements: after.elements,
    ...(edit.north !== undefined && { north: edit.north }),
  });
  await saveFloorPlan(ctx.householdId, loaded.floorId, input);
  return done(edit.summary, { warnings: planOverlaps(after.places, after.elements) });
}

/** A write tool whose `describe`, `preview` and `run` share one computed edit. */
function drawingTool<Input extends z.ZodObject>(definition: {
  name: string;
  description: string;
  input: Input;
  permission?: "write" | "sensitive";
  activity: { en: string; nl: string };
  describe?: (ctx: AssistantToolContext, input: z.output<Input>) => string;
  edit: (ctx: AssistantToolContext, input: z.output<Input>) => Promise<Edit>;
}) {
  const checkedEdit = async (ctx: AssistantToolContext, input: z.output<Input>) => {
    const edit = await definition.edit(ctx, input);
    const warnings = checkOverlaps(edit.loaded.before, edit.after, (input as { allowOverlaps?: boolean }).allowOverlaps);
    if (warnings.length) {
      edit.card.en += `; ${warnings.length} overlap warning(s), kept intentionally`;
      edit.card.nl += `; ${warnings.length} overlapwaarschuwing(en), bewust behouden`;
    }
    return edit;
  };
  registerAssistantTool({
    name: definition.name,
    description: definition.description,
    input: definition.input,
    permission: definition.permission ?? "write",
    confirm: "always",
    activity: definition.activity,
    describe: definition.describe ?? (async (ctx, input) => {
      const { card } = await checkedEdit(ctx, input);
      return say(ctx.locale, card.en, card.nl);
    }),
    preview: async (ctx, input) => previewOf(ctx, await checkedEdit(ctx, input)),
    run: async (ctx, input) => save(ctx, await checkedEdit(ctx, input)),
  });
}

function nextColor(doc: EditDoc): string {
  const used = new Set(doc.places.map((place) => place.color.toLowerCase()));
  return PLACE_COLORS.find((color) => !used.has(color)) ?? PLACE_COLORS[doc.places.length % PLACE_COLORS.length]!;
}

// ── Read ────────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "floorplan.plan",
  description: "The floor plan as text: each drawn room with size, area, cm box, neighbours per compass side, doors/windows per side; north; what isn't drawn.",
  input: z.object({ floor: entityRef("floor").optional().describe("Floor by name; default every floor with a drawing") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Looked at the floor plan", nl: "Plan bekeken" },
  run: async (ctx, input) => {
    const { floors, places } = await getPlacesOverview(ctx.householdId);
    const wanted = input.floor ? floors.filter((floor) => floor.id === input.floor!.id) : floors.filter((floor) => places.some((place) => place.floorId === floor.id && place.polygon));
    if (!wanted.length) return { plan: "Nothing is drawn yet. Draw a room with floorplan_draw_room (first room at xCm 0, yCm 0)." };
    const texts = await Promise.all(wanted.map(async (floor) => planSummary(await getFloorPlan(ctx.householdId, floor.id))));
    const text = texts.join("\n\n");
    return { plan: text.length > 3500 ? `${text.slice(0, 3500)}… (ask for one floor)` : text };
  },
});

// ── Rooms ───────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "floorplan.geometry",
  description: "Read the exact geometry and room/wall overlap warnings of one floor: room polygons, wall endpoints/thickness, opening ids/wallIds/centre offsets, north and underlay calibration. Use before drawing or repairing and to verify floorplan_edit_geometry. Coordinates are numeric {x,y} objects in cm, x right, y down.",
  input: z.object({ floor: entityRef("floor") }),
  permission: "read",
  confirm: "never",
  activity: { en: "Read the exact floor geometry", nl: "Exacte plangeometrie bekeken" },
  run: async (ctx, input) => geometryOf(await getFloorPlan(ctx.householdId, input.floor.id)),
});

drawingTool({
  name: "floorplan.edit_geometry",
  description: "Draw or repair rooms, walls, doors and windows in ONE atomic batch using common cm coordinates. Rooms use polygon, or inside to fill exactly from the final wall faces. Supports recesses and angled walls. Openings attach by wallId. Upsert by id; removeElementIds deletes elements. replaceDrawing replaces geometry, retaining room records. transform rotates supplied geometry together. No snapping or wall extension. New/enlarged room or wall overlaps are reported; allowOverlaps true keeps them intentionally. Read floorplan_geometry first and verify afterwards.",
  input: z.object({ floor: entityRef("floor"), ...geometryEditFields }),
  permission: "sensitive",
  activity: { en: "Edited exact floor geometry", nl: "Exacte plangeometrie aangepast" },
  // Auditing describes writes after saving: deletions must not be recomputed against the new plan.
  describe: (ctx, input) => say(ctx.locale,
    `${input.replaceDrawing ? "Replace" : "Edit"} the drawing on ${input.floor.name}: ${input.rooms.length} room outlines, ${input.elements.length} walls/openings, ${input.removeElementIds.length} explicit removals${input.replaceDrawing ? "; omitted outlines and elements are cleared" : ""}${input.allowOverlaps ? "; keep reported overlaps" : ""}`,
    `${input.replaceDrawing ? "Tekening vervangen" : "Tekening aanpassen"} op ${input.floor.name}: ${input.rooms.length} kamercontouren, ${input.elements.length} muren/openingen, ${input.removeElementIds.length} expliciete verwijderingen${input.replaceDrawing ? "; niet opgegeven contouren en elementen worden gewist" : ""}${input.allowOverlaps ? "; gemelde overlappingen behouden" : ""}`),
  edit: async (ctx, input) => {
    const loaded = await loadFloor(ctx, input.floor.id);
    const after = editGeometry(loaded.plan, input);
    const what = `${input.rooms.length} room outline(s), ${input.elements.length} wall/opening element(s)`;
    const verb = input.replaceDrawing ? "Replace the drawing" : "Edit the drawing";
    return {
      loaded,
      after,
      summary: `${verb} on ${loaded.plan.floor.name}: ${what}, ${input.removeElementIds.length} explicit removal(s).`,
      card: {
        en: `${verb} on ${loaded.plan.floor.name}: ${what}, ${input.removeElementIds.length} explicit removal(s)${input.replaceDrawing ? "; omitted room outlines and elements are cleared" : ""}`,
        nl: `${input.replaceDrawing ? "Tekening vervangen" : "Tekening aanpassen"} op ${loaded.plan.floor.name}: ${input.rooms.length} kamercontouren, ${input.elements.length} muren/openingen, ${input.removeElementIds.length} expliciete verwijderingen${input.replaceDrawing ? "; niet opgegeven contouren en elementen worden gewist" : ""}`,
      },
    };
  },
});

const drawInput = z.object({
  allowOverlaps,
  name: z.string().trim().min(1).max(60).describe("Room name; a room that already has this name gets this outline"),
  widthCm: cm("Size left–right on the plan, cm").optional(),
  depthCm: cm("Size top–bottom on the plan, cm").optional(),
  relativeTo: entityRef("place", "Existing drawn room to put it against").optional(),
  side: sideSchema.optional().describe("Which side of relativeTo"),
  align: z.enum(["start", "center", "end"]).default("start").describe("Along that side: start = top/left edges flush, end = bottom/right edges flush"),
  xCm: coordinate.optional().describe("Top-left corner x, only without relativeTo"),
  yCm: coordinate.optional().describe("Top-left corner y, only without relativeTo"),
  points: z.array(z.tuple([coordinate, coordinate])).min(3).max(64).optional().describe("Corners [x,y] in cm, only for non-rectangular rooms"),
  floor: entityRef("floor").optional(),
});

async function drawEdit(ctx: AssistantToolContext, input: z.output<typeof drawInput>): Promise<Edit> {
  const overview = await getPlacesOverview(ctx.householdId);
  const named = overview.places.filter((place) => fold(place.name) === fold(input.name));
  const floorId =
    input.floor?.id ||
    (input.relativeTo && floorOf(input.relativeTo)) ||
    (named.length === 1 ? named[0]!.floorId : undefined) ||
    (overview.floors.filter((floor) => floor.kind === "indoor").length === 1 ? overview.floors.find((floor) => floor.kind === "indoor")!.id : undefined);
  if (!floorId) throw new PlanEditError(`Which floor? ${overview.floors.map((floor) => floor.name).join(", ")}.`);
  const loaded = await loadFloor(ctx, floorId);
  const existing = loaded.before.places.find((place) => fold(place.name) === fold(input.name));

  let polygon;
  let where = "";
  let whereNl = "";
  if (input.points) {
    polygon = fromTuples(input.points);
  } else {
    if (!input.widthCm || !input.depthCm) throw new PlanEditError("Give widthCm and depthCm (or points).");
    const size = { width: Math.round(input.widthCm), depth: Math.round(input.depthCm) };
    if (input.relativeTo) {
      if (!input.side) throw new PlanEditError("Say which side of the room: side.");
      if (floorOf(input.relativeTo) !== floorId) throw new PlanEditError(`${input.relativeTo.name} is on another floor.`);
      const ref = boundsOf(outlineOf(findPlace(loaded.before, input.relativeTo.id)))!;
      polygon = rectPoints(placeBeside(ref, size, directionOf(input.side, loaded), input.align));
      where = ` ${relationText(input.side, input.relativeTo.name)}`;
      whereNl = ` ${relationTextNl(input.side, input.relativeTo.name)}`;
    } else if (input.xCm !== undefined && input.yCm !== undefined) {
      polygon = rectPoints({ x: Math.round(input.xCm), y: Math.round(input.yCm), ...size });
    } else if (!loaded.before.places.some((place) => place.polygon && place.key !== existing?.key)) {
      polygon = rectPoints({ x: 0, y: 0, ...size });
    } else {
      throw new PlanEditError("Say where: relativeTo + side (an existing room), or xCm/yCm.");
    }
  }

  if (!isSimplePolygon(polygon)) throw new PlanEditError("Give a simple room polygon with nonzero area; omit the repeated closing corner.");
  const key = existing?.key ?? "new";
  const after: EditDoc = existing
    ? { ...loaded.before, places: loaded.before.places.map((place) => (place.key === key ? { ...place, polygon } : place)) }
    : { ...loaded.before, places: [...loaded.before.places, { key, name: input.name, color: nextColor(loaded.before), icon: null, polygon }] };
  const { width, depth } = sizeOf(boundsOf(polygon)!);
  const verb = existing ? (existing.polygon ? "Redrew" : "Drew") : "Added";
  const name = existing?.name ?? input.name;
  const size = sizeText(width, depth);
  return {
    loaded,
    after,
    summary: `${verb} ${name} ${size}${where} on ${loaded.plan.floor.name}.`,
    card: { en: `Draw ${name} ${size}${where} on ${loaded.plan.floor.name}`, nl: `${name} tekenen: ${size}${whereNl} op ${loaded.plan.floor.name}` },
  };
}

drawingTool({
  name: "floorplan.draw_room",
  description:
    "Draw a room on the plan: a rectangle widthCm × depthCm against an existing room (relativeTo + side), or at xCm/yCm, or a polygon (points). Creates the room, or draws the outline of an existing room with that name.",
  input: drawInput,
  activity: { en: "Drew a room", nl: "Ruimte getekend" },
  edit: drawEdit,
});

const moveInput = z.object({
  allowOverlaps,
  room: entityRef("place"),
  side: sideSchema.optional().describe("With relativeTo: which side of it. With distanceCm: the direction to move"),
  relativeTo: entityRef("place", "Drawn room to move it next to").optional(),
  align: z.enum(["start", "center", "end"]).default("start"),
  distanceCm: z.number().min(1).max(10_000).optional(),
  xCm: coordinate.optional().describe("New top-left corner x"),
  yCm: coordinate.optional().describe("New top-left corner y"),
  withWalls: z.boolean().default(true).describe("Move the walls around the room along"),
});

drawingTool({
  name: "floorplan.move_room",
  description: "Move a drawn room: next to another room (relativeTo + side), distanceCm towards a side, or to xCm/yCm. Its walls, doors and windows move along.",
  input: moveInput,
  activity: { en: "Moved a room", nl: "Ruimte verplaatst" },
  edit: async (ctx, input) => {
    const loaded = await loadFloor(ctx, floorOf(input.room));
    const place = findPlace(loaded.before, input.room.id);
    const box = boundsOf(outlineOf(place))!;
    let dx: number;
    let dy: number;
    let how: string;
    let howNl: string;
    if (input.relativeTo) {
      if (!input.side) throw new PlanEditError("Say which side of the other room: side.");
      if (input.relativeTo.id === input.room.id) throw new PlanEditError("Pick another room to move it next to.");
      if (floorOf(input.relativeTo) !== loaded.floorId) throw new PlanEditError(`${input.relativeTo.name} is on another floor.`);
      const ref = boundsOf(outlineOf(findPlace(loaded.before, input.relativeTo.id)))!;
      const target = placeBeside(ref, sizeOf(box), directionOf(input.side, loaded), input.align);
      dx = target.x - box.minX;
      dy = target.y - box.minY;
      how = ` ${relationText(input.side, input.relativeTo.name)}`;
      howNl = ` naar ${relationTextNl(input.side, input.relativeTo.name)}`;
    } else if (input.side && input.distanceCm) {
      const step = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }[directionOf(input.side, loaded)];
      dx = step[0]! * Math.round(input.distanceCm);
      dy = step[1]! * Math.round(input.distanceCm);
      how = ` ${metres(input.distanceCm)} m ${input.side}`;
      howNl = ` ${metres(input.distanceCm)} m naar ${sideNl(input.side)}`;
    } else if (input.xCm !== undefined && input.yCm !== undefined) {
      dx = Math.round(input.xCm) - box.minX;
      dy = Math.round(input.yCm) - box.minY;
      how = ` to x ${Math.round(input.xCm)}, y ${Math.round(input.yCm)}`;
      howNl = ` naar x ${Math.round(input.xCm)}, y ${Math.round(input.yCm)}`;
    } else {
      throw new PlanEditError("Say where: relativeTo + side, side + distanceCm, or xCm/yCm.");
    }
    const after = moveRoom(loaded.before, place.id!, dx, dy, input.withWalls);
    return { loaded, after, summary: `Moved ${place.name}${how}.`, card: { en: `Move ${place.name}${how}`, nl: `${place.name}${howNl} verplaatsen` } };
  },
});

const resizeInput = z.object({
  allowOverlaps,
  room: entityRef("place"),
  widthCm: cm("New size left–right").optional(),
  depthCm: cm("New size top–bottom").optional(),
  side: sideSchema.optional().describe("The side that moves (default: right for width, below for depth)"),
  byCm: z.number().min(-5_000).max(5_000).optional().describe("With side: move that side out by this much (negative = in)"),
  withWalls: z.boolean().default(true),
});

drawingTool({
  name: "floorplan.resize_room",
  description: "Resize a drawn room: set widthCm/depthCm, or move one side by byCm. The walls on that side follow.",
  input: resizeInput,
  activity: { en: "Resized a room", nl: "Ruimte vergroot of verkleind" },
  edit: async (ctx, input) => {
    const loaded = await loadFloor(ctx, floorOf(input.room));
    const place = findPlace(loaded.before, input.room.id);
    let after = loaded.before;
    const sideDirection = input.side ? directionOf(input.side, loaded) : null;
    if (input.byCm !== undefined) {
      if (!sideDirection) throw new PlanEditError("Say which side moves: side.");
      after = resizeSide(after, place.id!, sideDirection, Math.round(input.byCm), input.withWalls);
    }
    if (input.widthCm !== undefined) {
      const current = sizeOf(boundsOf(outlineOf(findPlace(after, place.id!)))!).width;
      const direction = sideDirection === "left" ? "left" : "right";
      after = resizeSide(after, place.id!, direction, Math.round(input.widthCm) - current, input.withWalls);
    }
    if (input.depthCm !== undefined) {
      const current = sizeOf(boundsOf(outlineOf(findPlace(after, place.id!)))!).depth;
      const direction = sideDirection === "up" ? "up" : "down";
      after = resizeSide(after, place.id!, direction, Math.round(input.depthCm) - current, input.withWalls);
    }
    if (after === loaded.before) throw new PlanEditError("Give widthCm/depthCm, or side + byCm.");
    const box = boundsOf(outlineOf(findPlace(after, place.id!)))!;
    const { width, depth } = sizeOf(box);
    const size = sizeText(width, depth);
    return { loaded, after, summary: `${place.name} is now ${size}.`, card: { en: `Resize ${place.name} to ${size}`, nl: `${place.name} aanpassen naar ${size}` } };
  },
});

// ── Walls, doors and windows ────────────────────────────────────────────────────────────────────────

const KIND_NL = { door: "deur", window: "raam", wall: "muur" } as const;

drawingTool({
  name: "floorplan.add_opening",
  description:
    "Add a door, window or wall on one side of a drawn room. A door/window goes into the wall on that side (a wall is drawn first if there is none). side 'all' = walls around the room.",
  input: z.object({
    allowOverlaps,
    room: entityRef("place"),
    kind: z.enum(["door", "window", "wall"]),
    side: z.enum([...SIDES, "all"]),
    widthCm: z.number().min(20).max(1000).optional().describe("Door default 90, window 120"),
    offsetCm: z.number().min(0).max(10_000).optional().describe("From the side's top/left end to the near edge; default centred"),
    thicknessCm: z.number().min(2).max(100).optional().describe("Wall thickness; default 14 inside, 20 outside"),
  }),
  activity: { en: "Drew on the plan", nl: "Op het plan getekend" },
  edit: async (ctx, input) => {
    const loaded = await loadFloor(ctx, floorOf(input.room));
    const place = findPlace(loaded.before, input.room.id);
    const thickness = Math.round(input.thicknessCm ?? defaultWallThickness(loaded.plan.floor.kind === "outdoor"));
    if (input.kind === "wall") {
      const directions: ScreenDirection[] = input.side === "all" ? ["up", "right", "down", "left"] : [directionOf(input.side, loaded)];
      const { doc, added } = addWalls(loaded.before, place.id!, directions, thickness);
      if (!added) throw new PlanEditError(`${place.name} already has a wall there.`);
      const where = input.side === "all" ? "around" : `on the ${input.side} side of`;
      const whereNl = input.side === "all" ? "rond" : `aan de ${sideNl(input.side)}kant van`;
      return {
        loaded,
        after: doc,
        summary: `Added ${added} wall${added > 1 ? "s" : ""} (${thickness} cm) ${where} ${place.name}.`,
        card: { en: `Add ${added} wall${added > 1 ? "s" : ""} (${thickness} cm) ${where} ${place.name}`, nl: `${added} ${added > 1 ? "muren" : "muur"} (${thickness} cm) ${whereNl} ${place.name} tekenen` },
      };
    }
    if (input.side === "all") throw new PlanEditError("A door or window goes on one side: north, east, south, west (or above/below/left/right).");
    const width = Math.round(input.widthCm ?? (input.kind === "door" ? 90 : 120));
    const after = addOpening(loaded.before, place.id!, directionOf(input.side, loaded), {
      kind: input.kind,
      widthCm: width,
      offsetCm: input.offsetCm === undefined ? undefined : Math.round(input.offsetCm),
      thicknessCm: thickness,
    });
    const what = `a ${input.kind} of ${metres(width)} m on the ${input.side} side of ${place.name}`;
    return {
      loaded,
      after,
      summary: `Added ${what}.`,
      card: { en: `Add ${what}`, nl: `${input.kind === "door" ? "Een deur" : "Een raam"} van ${metres(width)} m aan de ${sideNl(input.side)}kant van ${place.name} tekenen` },
    };
  },
});

drawingTool({
  name: "floorplan.change_opening",
  description: "Move, resize, flip or remove a door, window or wall on one side of a drawn room (number: 1st, 2nd… from the side's top/left).",
  input: z.object({
    allowOverlaps,
    room: entityRef("place"),
    kind: z.enum(["door", "window", "wall"]),
    side: sideSchema,
    number: z.number().int().min(1).max(20).default(1),
    offsetCm: z.number().min(0).max(10_000).optional().describe("New distance from the side's top/left end to the near edge"),
    widthCm: z.number().min(2).max(1000).optional().describe("New width (for a wall: its thickness)"),
    flip: z.enum(["hinge", "swing"]).optional().describe("Doors only"),
    shiftCm: z.number().min(-1000).max(1000).optional().describe("Walls only: move it outward (negative = inward)"),
    remove: z.boolean().default(false),
  }),
  permission: "sensitive",
  activity: { en: "Changed the plan", nl: "Plan aangepast" },
  edit: async (ctx, input) => {
    const loaded = await loadFloor(ctx, floorOf(input.room));
    const place = findPlace(loaded.before, input.room.id);
    const after = changeOpening(loaded.before, place.id!, directionOf(input.side, loaded), input.kind, input.number, {
      offsetCm: input.offsetCm === undefined ? undefined : Math.round(input.offsetCm),
      widthCm: input.widthCm === undefined ? undefined : Math.round(input.widthCm),
      flip: input.flip,
      shiftCm: input.shiftCm === undefined ? undefined : Math.round(input.shiftCm),
      remove: input.remove,
    });
    const what = `the ${input.kind} on the ${input.side} side of ${place.name}`;
    const whatNl = `${KIND_NL[input.kind]} ${input.number > 1 ? `${input.number} ` : ""}aan de ${sideNl(input.side)}kant van ${place.name}`;
    return {
      loaded,
      after,
      summary: input.remove ? `Removed ${what}.` : `Changed ${what}.`,
      card: input.remove ? { en: `Remove ${what}`, nl: `De ${whatNl} verwijderen` } : { en: `Change ${what}`, nl: `De ${whatNl} aanpassen` },
    };
  },
});

// ── North ───────────────────────────────────────────────────────────────────────────────────────────

const NORTH_DEGREES = { up: 0, right: 90, down: 180, left: 270 } as const;

drawingTool({
  name: "floorplan.set_north",
  description: "Set where north is on the plans (shared by every floor): pointsTo up/right/down/left on the drawing, or degrees clockwise from up.",
  input: z.object({
    pointsTo: z.enum(["up", "right", "down", "left"]).optional(),
    degrees: z.number().min(0).lt(360).optional(),
  }),
  activity: { en: "Set north on the plan", nl: "Noorden op het plan ingesteld" },
  edit: async (ctx, input) => {
    const north = input.degrees ?? (input.pointsTo ? NORTH_DEGREES[input.pointsTo] : undefined);
    if (north === undefined) throw new PlanEditError("Give pointsTo or degrees.");
    const { floors, places } = await getPlacesOverview(ctx.householdId);
    const floor = floors.find((candidate) => places.some((place) => place.floorId === candidate.id && place.polygon)) ?? floors[0];
    if (!floor) throw new PlanEditError("There is no floor yet.");
    const loaded = await loadFloor(ctx, floor.id);
    const where = input.pointsTo ?? `${north}° from up`;
    const NL = { up: "naar boven", right: "naar rechts", down: "naar beneden", left: "naar links" } as const;
    return {
      loaded,
      after: { ...loaded.before, north },
      north,
      summary: `North now points ${where} on the plans.`,
      card: { en: `Set north to point ${where} on every floor plan`, nl: `Noorden ${input.pointsTo ? NL[input.pointsTo] : `op ${north}° van boven`} zetten op alle plannen` },
    };
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a floor's plan ──

registerScreenContext({
  kind: "floor",
  skills: ["floorplan", "places"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const plan = await getFloorPlan(ctx.householdId, id);
    return { label: plan.floor.name, summary: `the floor plan of "${plan.floor.name}" (${plan.places.length} rooms)` };
  },
});
