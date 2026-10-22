import { z } from "zod";
import { idSchema } from "@/types/common";
import { PLACE_COLORS, floorPlanInputSchema, planElementSchema, pointSchema, polygonSchema, type FloorPlan } from "@/features/places/types/places";
import { wallLength, withoutElement } from "@/features/places/types/plan-geometry";
import { fold } from "@ai/core/text-match";
import { changedPlaces, checkOverlaps, docOf, PlanEditError, type EditDoc } from "./plan-edit";
import { isSimplePolygon } from "@/features/places/types/polygon-geometry";
import { planOverlaps } from "@/features/places/types/plan-diagnostics";
import { findRoomAt } from "@/features/places/types/room-from-walls";

/** Uses the editor's numeric point objects and elements, so MCP clients need no tuple coercion. */
export const geometryEditFields = {
  allowOverlaps: z.boolean().default(false).describe("Explicitly keep reported room/wall overlaps; default rejects new or enlarged overlaps, while existing overlaps do not block repairs. Results always include overlap warnings."),
  rooms: z.array(z.object({
    id: idSchema.optional().describe("Existing room id from floorplan_geometry; otherwise matches name on this floor or creates it"),
    name: z.string().trim().min(1).max(60),
    polygon: polygonSchema.nullable().optional().describe("Exact inner room corners {x,y} in cm; implicit closing edge; null clears the outline. Give polygon OR inside."),
    inside: pointSchema.optional().describe("Point inside the room, in cm. Derives its outline from the final walls' inner faces using the editor's fill engine, so corners and thickness align. Give inside OR polygon; walls must enclose the room."),
  })).max(300).default([]),
  elements: z.array(planElementSchema).max(2000).default([]).describe("Exact walls and openings, upserted by id. Walls: a/b are centre-line endpoints, thickness in cm. Openings: wallId, offset from wall a to opening CENTRE, width in cm; doors also hingeAtEnd/swingFlipped. Use unique ids for new elements."),
  removeElementIds: z.array(idSchema).max(2000).default([]).describe("Delete these existing elements; removing a wall also removes its openings"),
  replaceDrawing: z.boolean().default(false).describe("True replaces ALL elements and clears outlines of rooms omitted from rooms; room records and their linked data are retained"),
  transform: z.object({
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0).describe("Clockwise degrees around origin; rotates every supplied room and wall together"),
    origin: pointSchema.default({ x: 0, y: 0 }),
    translation: pointSchema.default({ x: 0, y: 0 }).describe("Added after rotation, in cm"),
  }).optional().describe("Applied only to supplied geometry; existing geometry and true north stay as stored"),
};
export const geometryEditSchema = z.object(geometryEditFields);
export type GeometryEditInput = z.output<typeof geometryEditSchema>;

/** Build one coherent edit; no snapping, auto-walls, clamping, or database side effects. */
export function editGeometry(plan: FloorPlan, input: GeometryEditInput): EditDoc {
  const before = docOf(plan);
  const transform = (point: { x: number; y: number }) => {
    if (!input.transform) return { ...point };
    const { rotation, origin, translation } = input.transform;
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    const rotated = rotation === 90 ? { x: -y, y: x } : rotation === 180 ? { x: -x, y: -y } : rotation === 270 ? { x: y, y: -x } : { x, y };
    return { x: rotated.x + origin.x + translation.x, y: rotated.y + origin.y + translation.y };
  };
  const after: EditDoc = {
    ...before,
    places: before.places.map((place) => ({ ...place, ...(input.replaceDrawing && { polygon: null }) })),
    elements: input.replaceDrawing ? [] : [...before.elements],
  };
  // Resolve and validate the final wall/opening network before filling any rooms from it.
  const incomingIds = new Set<string>();
  for (const element of input.elements) {
    if (incomingIds.has(element.id)) throw new PlanEditError(`Duplicate element id: ${element.id}.`);
    incomingIds.add(element.id);
  }
  for (const id of input.removeElementIds) {
    if (incomingIds.has(id)) throw new PlanEditError(`Element ${id} cannot be removed and edited in the same batch.`);
    if (!before.elements.some((element) => element.id === id)) throw new PlanEditError(`Element ${id} is not on this floor.`);
    after.elements = withoutElement(after.elements, id);
  }
  const incoming = input.elements.map((element) => element.kind === "wall" ? { ...element, a: transform(element.a), b: transform(element.b) } : { ...element });
  after.elements = [...after.elements.filter((element) => !incomingIds.has(element.id)), ...incoming];
  const parsedElements = floorPlanInputSchema.safeParse({ gridSize: plan.floor.gridSize, places: [], elements: after.elements });
  if (!parsedElements.success) throw new PlanEditError(parsedElements.error.issues.map((issue) => issue.message).join("; "));
  const walls = new Map(after.elements.flatMap((element) => element.kind === "wall" ? [[element.id, element] as const] : []));
  for (const wall of walls.values()) {
    if (!wallLength(wall)) throw new PlanEditError(`Wall ${wall.id} must have distinct endpoints.`);
  }
  for (const element of after.elements) {
    if (element.kind === "wall") continue;
    const length = wallLength(walls.get(element.wallId)!);
    if (element.offset < element.width / 2 || element.offset + element.width / 2 > length + 1e-7) throw new PlanEditError(`${element.kind} ${element.id} does not fit inside wall ${element.wallId}. Use a centre offset from wall a; geometry was not moved or clamped.`);
  }
  const touched = new Set<string>();
  for (const room of input.rooms) {
    const matches = before.places.filter((place) => room.id ? place.id === room.id : fold(place.name) === fold(room.name));
    if (room.id && !matches.length) throw new PlanEditError(`${room.name}: room id is not on this floor.`);
    if (matches.length > 1) throw new PlanEditError(`${room.name} is ambiguous on this floor. Give its id from floorplan_geometry.`);
    const existing = matches[0];
    const key = existing?.key ?? `new:${fold(room.name)}`;
    if (touched.has(key) || after.places.some((place) => place.key !== key && fold(place.name) === fold(room.name))) throw new PlanEditError(`Duplicate room name or id: ${room.name}.`);
    touched.add(key);
    if ((room.polygon !== undefined) === (room.inside !== undefined)) throw new PlanEditError(`${room.name}: give polygon OR inside.`);
    let polygon = room.polygon?.map(transform) ?? null;
    if (room.inside) {
      const result = findRoomAt(after.elements, transform(room.inside), { gapTolerance: 0 });
      if (!result.ok) throw new PlanEditError(`${room.name}: cannot fill from walls (${result.reason}). ${result.gaps.length ? `Wall gaps near ${JSON.stringify(result.gaps)}.` : "Choose an interior point and enclose the room with wall segments."}`);
      polygon = result.polygon;
    }
    if (polygon && !isSimplePolygon(polygon)) throw new PlanEditError(`${room.name}: outline must be a simple polygon with nonzero area, without repeated closing corners.`);
    if (existing) {
      after.places = after.places.map((place) => place.key === key ? { ...place, name: room.name, polygon } : place);
    } else {
      const used = new Set(after.places.map((place) => place.color.toLowerCase()));
      const color = PLACE_COLORS.find((color) => !used.has(color)) ?? PLACE_COLORS[after.places.length % PLACE_COLORS.length]!;
      after.places.push({ key, name: room.name, color, icon: null, polygon });
    }
  }
  const parsed = floorPlanInputSchema.safeParse({ gridSize: plan.floor.gridSize, places: changedPlaces(before, after), elements: after.elements });
  if (!parsed.success) throw new PlanEditError(parsed.error.issues.map((issue) => issue.message).join("; "));
  checkOverlaps(before, after, input.allowOverlaps);
  return after;
}

/** Exact geometry for verification and id-based edits, without the summary's bounding-box approximation. */
export function geometryOf(plan: FloorPlan) {
  return {
    floor: plan.floor,
    coordinates: "cm, whole numbers; x right, y down; wall a/b are centre-line endpoints; opening offset is from wall a to its centre",
    north: plan.north ?? null,
    rooms: plan.places.map(({ id, name, color, icon, polygon }) => ({ id, name, color, icon, polygon })),
    elements: plan.elements,
    underlay: plan.underlay ?? null,
    warnings: planOverlaps(plan.places, plan.elements),
  };
}
