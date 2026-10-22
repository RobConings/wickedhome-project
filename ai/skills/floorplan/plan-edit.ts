import { HttpError } from "@/api/lib/http";
import type { FloorPlan, PlanElement, PlanPlaceInput, Point, Wall } from "@/features/places/types/places";
import { polygonAreaM2 } from "@/features/places/types/places";
import type { PlanDiffData, PlanDiffPoint, PlanDiffState } from "@/features/places/types/plan-diff";
import {
  boundsOf,
  clampOpeningOffset,
  keepOpeningsInWalls,
  newElementId,
  openingShape,
  pointAlongWall,
  projectOnSegment,
  wallLength,
  withoutElement,
  type Bounds,
} from "@/features/places/types/plan-geometry";
import { isSimplePolygon, polygonIntersectionArea } from "@/features/places/types/polygon-geometry";
import { planOverlaps } from "@/features/places/types/plan-diagnostics";

/**
 * The floor-plan drawing maths of the assistant: pure functions from a `FloorPlan` and human-shaped input
 * ("4 × 3 m east of the kitchen", "a door on the south side") to a changed plan, a short summary and the
 * `plan-diff` preview. The geometry helpers and validation are the editor's (plan-geometry.ts, the plan
 * schemas); the tools in tools.ts only load, preview and save. Unit tested in plan-edit.test.ts.
 *
 * Coordinates are the plan's: centimetres, x to the right, y down. North is the household's
 * `planNorthDegrees` (degrees clockwise from the plan's "up"); without it, north is up.
 */

// ── Directions ──────────────────────────────────────────────────────────────────────────────────────

/** Compass sides follow the plan's north; screen sides (above/below/left/right) follow the drawing. */
export const SIDES = ["north", "east", "south", "west", "above", "below", "left", "right"] as const;
export type Side = (typeof SIDES)[number];
export type ScreenDirection = "up" | "right" | "down" | "left";
export type Compass = "north" | "east" | "south" | "west";

const SCREEN_ORDER: readonly ScreenDirection[] = ["up", "right", "down", "left"];
const COMPASS_ORDER: readonly Compass[] = ["north", "east", "south", "west"];
const quarter = (degrees: number) => ((Math.round(degrees / 90) % 4) + 4) % 4;

/** Where a side lies on the drawing. Compass sides are rounded to the nearest plan axis. */
export function screenDirection(side: Side, north: number | null | undefined): ScreenDirection {
  switch (side) {
    case "above":
      return "up";
    case "below":
      return "down";
    case "left":
    case "right":
      return side;
    default:
      return SCREEN_ORDER[quarter((north ?? 0) + COMPASS_ORDER.indexOf(side) * 90)]!;
  }
}

/** The compass side of a direction on the drawing (the inverse of `screenDirection`). */
export function compassOf(direction: ScreenDirection, north: number | null | undefined): Compass {
  return COMPASS_ORDER[quarter(SCREEN_ORDER.indexOf(direction) * 90 - (north ?? 0))]!;
}

const STEP: Record<ScreenDirection, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const horizontal = (direction: ScreenDirection) => direction === "up" || direction === "down";

// ── Numbers for people ──────────────────────────────────────────────────────────────────────────────

const METRES = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2 });
/** 320 → "3,2" (metres, Belgian notation). */
export const metres = (cm: number) => METRES.format(Math.round(cm) / 100);
/** "3,2 × 2,8 m" */
export const sizeText = (widthCm: number, depthCm: number) => `${metres(widthCm)} × ${metres(depthCm)} m`;

// ── Shapes ──────────────────────────────────────────────────────────────────────────────────────────

export type Tuple = [number, number];
export type Rect = { x: number; y: number; width: number; depth: number };
export type Align = "start" | "center" | "end";

export const rectPoints = ({ x, y, width, depth }: Rect): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + depth },
  { x, y: y + depth },
];

const round = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });
export const fromTuples = (points: readonly Tuple[]): Point[] => points.map(([x, y]) => round({ x, y }));
const toTuple = (point: Point): PlanDiffPoint => [Math.round(point.x), Math.round(point.y)];

export const sizeOf = (bounds: Bounds) => ({ width: bounds.maxX - bounds.minX, depth: bounds.maxY - bounds.minY });

/** A 4-corner outline with only horizontal and vertical edges. */
export function isRectangle(polygon: readonly Point[]): boolean {
  if (polygon.length !== 4 || !isSimplePolygon(polygon)) return false;
  return polygon.every((point, index) => {
    const next = polygon[(index + 1) % 4]!;
    return point.x === next.x || point.y === next.y;
  });
}

/**
 * A `width` × `depth` rectangle against one side of `ref`: right of it, above it… `align` says where along
 * that side: `start` = flush with its top (left/right) or left (above/below) edge, `end` = the bottom or
 * right edge, `center` = centred. `gap` leaves room in between (e.g. a wall's thickness).
 */
export function placeBeside(ref: Bounds, size: { width: number; depth: number }, direction: ScreenDirection, align: Align = "start", gap = 0): Rect {
  const { width, depth } = size;
  const along = (min: number, max: number, length: number) =>
    align === "start" ? min : align === "end" ? max - length : Math.round((min + max) / 2 - length / 2);
  switch (direction) {
    case "right":
      return { x: ref.maxX + gap, y: along(ref.minY, ref.maxY, depth), width, depth };
    case "left":
      return { x: ref.minX - gap - width, y: along(ref.minY, ref.maxY, depth), width, depth };
    case "down":
      return { x: along(ref.minX, ref.maxX, width), y: ref.maxY + gap, width, depth };
    case "up":
      return { x: along(ref.minX, ref.maxX, width), y: ref.minY - gap - depth, width, depth };
  }
}

/** A room may not end up on top of another room (touching is fine). Returns the name of the first overlap. */
export function overlappingRoom(polygon: readonly Point[], places: readonly { id?: string; name: string; polygon: Point[] | null }[], ignoreId?: string): string | null {
  const box = boundsOf(polygon);
  if (!box) return null;
  for (const place of places) {
    if (!place.polygon || (ignoreId && place.id === ignoreId)) continue;
    const other = boundsOf(place.polygon);
    if (!other) continue;
    const overlapX = Math.min(box.maxX, other.maxX) - Math.max(box.minX, other.minX);
    const overlapY = Math.min(box.maxY, other.maxY) - Math.max(box.minY, other.minY);
    // A few cm of overlap is a traced wall face, not a mistake.
    if (overlapX > 5 && overlapY > 5 && overlapX * overlapY > 2500 && polygonIntersectionArea(polygon, place.polygon) > 2500) return place.name;
  }
  return null;
}

// ── The plan being edited ───────────────────────────────────────────────────────────────────────────

export type EditPlace = { id?: string; key: string; name: string; color: string; icon: string | null; polygon: Point[] | null };
export type EditDoc = { places: EditPlace[]; elements: PlanElement[]; north: number | null };

/** Existing overlaps do not block repairs. New or enlarged overlaps require an explicit choice. */
export function checkOverlaps(before: EditDoc, after: EditDoc, allowOverlaps = false) {
  const warnings = planOverlaps(after.places, after.elements);
  if (allowOverlaps) return warnings;
  const key = (warning: (typeof warnings)[number]) => JSON.stringify([warning.kind, ...[warning.first, warning.second].sort()]);
  const old = new Map(planOverlaps(before.places, before.elements).map((warning) => [key(warning), warning.amount]));
  const added = warnings.filter((warning) => warning.amount > (old.get(key(warning)) ?? 0) + 1e-7);
  if (added.length) throw new PlanEditError(`Overlap warnings: ${added.map((warning) => warning.message).join(" ")} Correct the geometry or explicitly keep these overlaps with allowOverlaps: true.`);
  return warnings;
}

export const docOf = (plan: FloorPlan): EditDoc => ({
  places: plan.places.map((place) => ({ id: place.id, key: place.id, name: place.name, color: place.color, icon: place.icon, polygon: place.polygon })),
  elements: plan.elements,
  north: plan.north ?? null,
});

/** The rooms to save (new ones and the ones that changed); the service leaves the others as they are. */
export function changedPlaces(before: EditDoc, after: EditDoc): PlanPlaceInput[] {
  const old = new Map(before.places.map((place) => [place.key, place]));
  return after.places
    .filter((place) => JSON.stringify(old.get(place.key)) !== JSON.stringify(place))
    .map(({ id, name, color, icon, polygon }) => ({ ...(id && { id }), name, color, icon, polygon }));
}

/** A change that can't be drawn: a 400, so the model gets the message (and the person no card). */
export class PlanEditError extends HttpError {
  constructor(message: string) {
    super(400, "bad_request", message);
  }
}
const fail = (message: string): never => {
  throw new PlanEditError(message);
};

export function findPlace(doc: EditDoc, id: string): EditPlace {
  return doc.places.find((place) => place.id === id) ?? fail("That room is not on this floor.");
}

export function outlineOf(place: EditPlace): Point[] {
  return place.polygon ?? fail(`${place.name} is not drawn on the plan yet: draw it first (floorplan_draw_room).`);
}

/** Side-based edits cannot identify the intended edge of a recessed or angled room. */
function rectangularOutline(place: EditPlace): Point[] {
  const polygon = outlineOf(place);
  if (!isRectangle(polygon)) fail(`${place.name} is not rectangular. Use floorplan_geometry and floorplan_edit_geometry with exact wall endpoints and opening wallIds.`);
  return polygon;
}

// ── Walls along a room's side ───────────────────────────────────────────────────────────────────────

/** Default wall thickness of new walls, as the editor: 14 cm inside, 20 cm outside. */
export const defaultWallThickness = (outdoor: boolean) => (outdoor ? 20 : 14);

/** The room's extreme edge on one side: the line (fixed coordinate) and its span. */
export function sideEdge(bounds: Bounds, direction: ScreenDirection) {
  switch (direction) {
    case "up":
      return { fixed: bounds.minY, from: bounds.minX, to: bounds.maxX };
    case "down":
      return { fixed: bounds.maxY, from: bounds.minX, to: bounds.maxX };
    case "left":
      return { fixed: bounds.minX, from: bounds.minY, to: bounds.maxY };
    case "right":
      return { fixed: bounds.maxX, from: bounds.minY, to: bounds.maxY };
  }
}

/** Walls lying along a side of the room (parallel, on its edge line, overlapping it), longest overlap first. */
export function wallsOnSide(elements: readonly PlanElement[], bounds: Bounds, direction: ScreenDirection): Wall[] {
  const edge = sideEdge(bounds, direction);
  const along = horizontal(direction);
  const scored: { wall: Wall; overlap: number }[] = [];
  for (const element of elements) {
    if (element.kind !== "wall") continue;
    const parallel = along ? Math.abs(element.a.y - element.b.y) <= 2 : Math.abs(element.a.x - element.b.x) <= 2;
    if (!parallel) continue;
    const line = along ? (element.a.y + element.b.y) / 2 : (element.a.x + element.b.x) / 2;
    if (Math.abs(line - edge.fixed) > element.thickness / 2 + 10) continue;
    const [lo, hi] = along ? [Math.min(element.a.x, element.b.x), Math.max(element.a.x, element.b.x)] : [Math.min(element.a.y, element.b.y), Math.max(element.a.y, element.b.y)];
    const overlap = Math.min(hi, edge.to) - Math.max(lo, edge.from);
    if (overlap > 10) scored.push({ wall: element, overlap });
  }
  return scored.sort((a, b) => b.overlap - a.overlap).map((entry) => entry.wall);
}

/** A new wall along the side, its inner face on the room's edge (like walls traced around a room). */
export function wallAlongSide(bounds: Bounds, direction: ScreenDirection, thickness: number): Wall {
  const edge = sideEdge(bounds, direction);
  const out = STEP[direction];
  const shift = thickness / 2;
  // Ends stick out by half the thickness so the corners with neighbouring walls close.
  const from = edge.from - shift;
  const to = edge.to + shift;
  const fixed = edge.fixed + (horizontal(direction) ? out.y : out.x) * shift;
  const a = horizontal(direction) ? { x: from, y: fixed } : { x: fixed, y: from };
  const b = horizontal(direction) ? { x: to, y: fixed } : { x: fixed, y: to };
  return { id: newElementId(), kind: "wall", a: round(a), b: round(b), thickness };
}

/** Where along a wall (its offset from `a`) a point on the room's side lies. */
const offsetOnWall = (wall: Wall, point: Point) => projectOnSegment(point, wall.a, wall.b).t * wallLength(wall);

/** Doors or windows in the walls of one side, ordered from the side's start (top or left). */
export function openingsOnSide(elements: readonly PlanElement[], bounds: Bounds, direction: ScreenDirection, kind: "door" | "window") {
  const walls = new Map(wallsOnSide(elements, bounds, direction).map((wall) => [wall.id, wall]));
  const edge = sideEdge(bounds, direction);
  const along = horizontal(direction);
  return elements
    .flatMap((element) => {
      if (element.kind !== kind) return [];
      const wall = walls.get(element.wallId);
      if (!wall) return [];
      const centre = pointAlongWall(wall, element.offset);
      const position = along ? centre.x : centre.y;
      return position >= edge.from - 5 && position <= edge.to + 5 ? [{ opening: element, wall, position }] : [];
    })
    .sort((a, b) => a.position - b.position);
}

// ── Edits ───────────────────────────────────────────────────────────────────────────────────────────

export type EditResult = { doc: EditDoc; summary: string; markers?: PlanDiffData["markers"] };

/** Distance from a point to the room outline. */
function distanceToOutline(point: Point, polygon: readonly Point[]): number {
  let best = Infinity;
  polygon.forEach((corner, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    best = Math.min(best, projectOnSegment(point, corner, next).distance);
  });
  return best;
}

/**
 * Walls around the room (both ends on or just outside its outline): they move with the room. A wall that
 * also runs along another drawn room is `shared` with it: it stays, so the neighbour keeps its wall.
 */
function wallsAround(doc: EditDoc, place: EditPlace): { own: Set<string>; shared: Set<string> } {
  const polygon = place.polygon ?? [];
  const others = doc.places.filter((other) => other.key !== place.key && other.polygon).map((other) => other.polygon!);
  const along = (wall: Wall, outline: readonly Point[]) => {
    const reach = wall.thickness / 2 + 5;
    return distanceToOutline(wall.a, outline) <= reach && distanceToOutline(wall.b, outline) <= reach;
  };
  const own = new Set<string>();
  const shared = new Set<string>();
  for (const element of doc.elements) {
    if (element.kind !== "wall" || !along(element, polygon)) continue;
    (others.some((outline) => along(element, outline)) ? shared : own).add(element.id);
  }
  return { own, shared };
}

/** Moves a room by dx/dy, with the walls around it (and so their doors and windows). */
export function moveRoom(doc: EditDoc, placeId: string, dx: number, dy: number, withWalls = true): EditDoc {
  const place = findPlace(doc, placeId);
  const polygon = outlineOf(place);
  const shift = (point: Point) => round({ x: point.x + dx, y: point.y + dy });
  const moving = withWalls ? wallsAround(doc, place).own : new Set<string>();
  return {
    ...doc,
    places: doc.places.map((candidate) => (candidate.key === place.key ? { ...candidate, polygon: polygon.map(shift) } : candidate)),
    elements: doc.elements.map((element) => (element.kind === "wall" && moving.has(element.id) ? { ...element, a: shift(element.a), b: shift(element.b) } : element)),
  };
}

/**
 * Moves one side of a room outward by `by` cm (negative: inward). Corners on that side move; so do the walls
 * on that side and the ends of the walls joining it, so the room keeps its walls (walls shared with a
 * neighbouring room stay). Doors and windows stay in their (possibly shorter) walls.
 */
export function resizeSide(doc: EditDoc, placeId: string, direction: ScreenDirection, by: number, withWalls = true): EditDoc {
  const place = findPlace(doc, placeId);
  const polygon = rectangularOutline(place);
  const bounds = boundsOf(polygon)!;
  const edge = sideEdge(bounds, direction);
  const step = STEP[direction];
  const along = horizontal(direction);
  const coordinate = (point: Point) => (along ? point.y : point.x);
  const outwardSign = along ? step.y : step.x;
  const onSide = (point: Point, tolerance: number) => (coordinate(point) - edge.fixed) * outwardSign >= -tolerance;
  const shift = (point: Point) => round({ x: point.x + step.x * by, y: point.y + step.y * by });

  // The side may move in, but not past (or within 50 cm of) the room's other corners.
  const size = along ? bounds.maxY - bounds.minY : bounds.maxX - bounds.minX;
  const inner = Math.max(...polygon.filter((point) => !onSide(point, 1)).map((point) => (coordinate(point) - edge.fixed) * outwardSign), -size);
  if (by < inner + 50) fail(`${place.name} would get too small (that side can move in at most ${metres(Math.max(0, -inner - 50))} m).`);

  const { own, shared } = withWalls ? wallsAround(doc, place) : { own: new Set<string>(), shared: new Set<string>() };
  const elements = doc.elements.map((element) => {
    if (element.kind !== "wall" || !(own.has(element.id) || shared.has(element.id))) return element;
    const reach = element.thickness / 2 + 5;
    const moveA = onSide(element.a, reach);
    const moveB = onSide(element.b, reach);
    // A shared wall on the moving side stays (the neighbour keeps it); a shared wall joining it stretches.
    if (moveA && moveB && shared.has(element.id)) return element;
    return moveA || moveB ? { ...element, a: moveA ? shift(element.a) : element.a, b: moveB ? shift(element.b) : element.b } : element;
  });
  return {
    ...doc,
    places: doc.places.map((candidate) => (candidate.key === place.key ? { ...candidate, polygon: polygon.map((point) => (onSide(point, 1) ? shift(point) : point)) } : candidate)),
    elements: keepOpeningsInWalls(elements),
  };
}

export type OpeningInput = { kind: "door" | "window"; widthCm: number; offsetCm?: number; thicknessCm: number };

/**
 * A door or window on one side of a room. It goes into the wall along that side; without one, a wall is
 * drawn along the whole side first. `offsetCm`: from the side's start (top or left end) to the opening's near
 * edge; default centred. Doors open into the room.
 */
export function addOpening(doc: EditDoc, placeId: string, direction: ScreenDirection, input: OpeningInput): EditDoc {
  const place = findPlace(doc, placeId);
  const polygon = rectangularOutline(place);
  const bounds = boundsOf(polygon)!;
  const edge = sideEdge(bounds, direction);
  const along = horizontal(direction);
  const length = edge.to - edge.from;
  if (input.widthCm > length) fail(`That side of ${place.name} is only ${metres(length)} m long.`);
  const centre = input.offsetCm === undefined ? edge.from + length / 2 : edge.from + input.offsetCm + input.widthCm / 2;
  if (centre + input.widthCm / 2 > edge.to + 1) fail(`The ${input.kind} doesn't fit there: that side of ${place.name} is ${metres(length)} m long.`);
  const target = along ? { x: centre, y: edge.fixed } : { x: edge.fixed, y: centre };

  let elements = doc.elements;
  let wall = wallsOnSide(elements, bounds, direction).find((candidate) => projectOnSegment(target, candidate.a, candidate.b).distance <= candidate.thickness / 2 + 10);
  if (!wall) {
    wall = wallAlongSide(bounds, direction, input.thicknessCm);
    elements = [...elements, wall];
  }
  const offset = clampOpeningOffset(wall, input.widthCm, offsetOnWall(wall, target)) ?? fail(`The wall there is shorter than ${metres(input.widthCm)} m.`);
  if (Math.abs(offset - offsetOnWall(wall, target)) > 1) fail(`The ${input.kind} does not fit at that position in wall ${wall.id}. Use floorplan_edit_geometry to correct the wall segment or opening; it was not shifted.`);
  const id = newElementId();
  if (input.kind === "window") return { ...doc, elements: [...elements, { id, kind: "window", wallId: wall.id, offset, width: input.widthCm }] };
  const door = { id, kind: "door" as const, wallId: wall.id, offset, width: input.widthCm, hingeAtEnd: false, swingFlipped: false };
  // Open into the room: flip the swing when the leaf would point away from it.
  const tip = openingShape(wall, door).leafTip;
  const inward = (along ? tip.y - edge.fixed : tip.x - edge.fixed) * (along ? STEP[direction].y : STEP[direction].x) < 0;
  return { ...doc, elements: [...elements, { ...door, swingFlipped: !inward }] };
}

/** Walls along one side (or every side) of a room, skipping sides that already have one. */
export function addWalls(doc: EditDoc, placeId: string, directions: readonly ScreenDirection[], thickness: number): { doc: EditDoc; added: number } {
  const place = findPlace(doc, placeId);
  const bounds = boundsOf(rectangularOutline(place))!;
  const added = directions.filter((direction) => wallsOnSide(doc.elements, bounds, direction).length === 0).map((direction) => wallAlongSide(bounds, direction, thickness));
  return { doc: { ...doc, elements: [...doc.elements, ...added] }, added: added.length };
}

export type OpeningChange = { offsetCm?: number; widthCm?: number; flip?: "hinge" | "swing"; shiftCm?: number; remove?: boolean };

/** Changes (or removes) the n-th door, window or wall on a side of a room. */
export function changeOpening(doc: EditDoc, placeId: string, direction: ScreenDirection, kind: "door" | "window" | "wall", number: number, change: OpeningChange): EditDoc {
  const place = findPlace(doc, placeId);
  const bounds = boundsOf(rectangularOutline(place))!;
  const edge = sideEdge(bounds, direction);
  const label = `${kind} ${number} on that side of ${place.name}`;
  if (kind === "wall") {
    const walls = wallsOnSide(doc.elements, bounds, direction).sort((a, b) => Math.min(a.a.x + a.a.y, a.b.x + a.b.y) - Math.min(b.a.x + b.a.y, b.b.x + b.b.y));
    const wall = walls[number - 1] ?? fail(walls.length ? `There is no ${label} (there ${walls.length === 1 ? "is 1" : `are ${walls.length}`}).` : `There is no wall on that side of ${place.name}.`);
    if (change.remove) return { ...doc, elements: withoutElement(doc.elements, wall.id) };
    const by = change.shiftCm ?? 0;
    const step = STEP[direction];
    const shift = (point: Point) => round({ x: point.x + step.x * by, y: point.y + step.y * by });
    const thickness = change.widthCm ?? wall.thickness;
    return { ...doc, elements: keepOpeningsInWalls(doc.elements.map((element) => (element.id === wall.id ? { ...wall, a: shift(wall.a), b: shift(wall.b), thickness } : element))) };
  }
  const list = openingsOnSide(doc.elements, bounds, direction, kind);
  const found = list[number - 1] ?? fail(list.length ? `There is no ${label} (there ${list.length === 1 ? "is 1" : `are ${list.length}`}).` : `There is no ${kind} on that side of ${place.name}.`);
  const { opening, wall } = found;
  if (change.remove) return { ...doc, elements: withoutElement(doc.elements, opening.id) };
  const width = change.widthCm ?? opening.width;
  if (wallLength(wall) < width) fail(`The wall is only ${metres(wallLength(wall))} m long.`);
  let offset = opening.offset;
  if (change.offsetCm !== undefined) {
    const centre = edge.from + change.offsetCm + width / 2;
    offset = offsetOnWall(wall, horizontal(direction) ? { x: centre, y: edge.fixed } : { x: edge.fixed, y: centre });
  }
  const clamped = clampOpeningOffset(wall, width, offset) ?? fail(`The wall is shorter than ${metres(width)} m.`);
  if (Math.abs(clamped - offset) > 1) fail(`The ${kind} does not fit at that position in wall ${wall.id}. Correct its width or position; it was not shifted.`);
  const next =
    opening.kind === "door"
      ? { ...opening, width, offset: clamped, hingeAtEnd: change.flip === "hinge" ? !opening.hingeAtEnd : opening.hingeAtEnd, swingFlipped: change.flip === "swing" ? !opening.swingFlipped : opening.swingFlipped }
      : { ...opening, width, offset: clamped };
  return { ...doc, elements: doc.elements.map((element) => (element.id === opening.id ? next : element)) };
}

// ── Reading the plan ────────────────────────────────────────────────────────────────────────────────

/** Rooms that touch this one, per compass side ("east Keuken"). */
export function neighbours(doc: EditDoc, placeId: string): string[] {
  const place = doc.places.find((candidate) => candidate.id === placeId);
  const box = place?.polygon ? boundsOf(place.polygon) : null;
  if (!place || !box) return [];
  const found: string[] = [];
  for (const other of doc.places) {
    if (other.key === place.key || !other.polygon) continue;
    const b = boundsOf(other.polygon)!;
    const overlapX = Math.min(box.maxX, b.maxX) - Math.max(box.minX, b.minX);
    const overlapY = Math.min(box.maxY, b.maxY) - Math.max(box.minY, b.minY);
    // Touching (or a wall's thickness apart) along a shared stretch of at least 50 cm.
    const near = (a: number, c: number) => Math.abs(a - c) <= 40;
    let direction: ScreenDirection | null = null;
    if (overlapY >= 50 && near(b.minX, box.maxX)) direction = "right";
    else if (overlapY >= 50 && near(b.maxX, box.minX)) direction = "left";
    else if (overlapX >= 50 && near(b.minY, box.maxY)) direction = "down";
    else if (overlapX >= 50 && near(b.maxY, box.minY)) direction = "up";
    if (direction) found.push(`${compassOf(direction, doc.north)} ${other.name}`);
  }
  return found;
}

const DIRECTION_WORD: Record<ScreenDirection, string> = { up: "up", right: "right", down: "down", left: "left" };

/** One line per room: size, area, where it is (cm box), neighbours, doors and windows per side. */
export function roomLine(doc: EditDoc, place: EditPlace): string {
  if (!place.polygon) return `${place.name}: not drawn`;
  const bounds = boundsOf(place.polygon)!;
  const { width, depth } = sizeOf(bounds);
  const shape = isRectangle(place.polygon) ? "" : ` (${place.polygon.length} corners)`;
  const parts = [
    `${place.name} ${sizeText(width, depth)}${shape}, ${METRES.format(polygonAreaM2(place.polygon))} m², x ${bounds.minX}–${bounds.maxX} y ${bounds.minY}–${bounds.maxY}`,
  ];
  const near = place.id ? neighbours(doc, place.id) : [];
  if (near.length) parts.push(`next to: ${near.join(", ")}`);
  const openings: string[] = [];
  for (const direction of SCREEN_ORDER) {
    const doors = openingsOnSide(doc.elements, bounds, direction, "door").length;
    const windows = openingsOnSide(doc.elements, bounds, direction, "window").length;
    const walls = wallsOnSide(doc.elements, bounds, direction).length;
    const bits = [doors && `${doors} door${doors > 1 ? "s" : ""}`, windows && `${windows} window${windows > 1 ? "s" : ""}`, !walls && "no wall"].filter(Boolean);
    if (bits.length) openings.push(`${compassOf(direction, doc.north)}: ${bits.join(" + ")}`);
  }
  if (openings.length) parts.push(openings.join("; "));
  return parts.join("; ");
}

/** The whole floor as a few lines of text (never raw geometry). */
export function planSummary(plan: FloorPlan): string {
  const doc = docOf(plan);
  const north = plan.north ?? null;
  const northText = north === null ? "north not set (taken as up)" : `north points ${DIRECTION_WORD[SCREEN_ORDER[quarter(north)]!]} (${Math.round(north)}°)`;
  const drawn = doc.places.filter((place) => place.polygon);
  const undrawn = doc.places.filter((place) => !place.polygon).map((place) => place.name);
  const count = (kind: PlanElement["kind"]) => plan.elements.filter((element) => element.kind === kind).length;
  return [
    `${plan.floor.name}: cm, x right, y down; ${northText}.`,
    ...drawn.map((place) => `- ${roomLine(doc, place)}`),
    undrawn.length ? `Not drawn: ${undrawn.join(", ")}.` : "",
    `Walls ${count("wall")}, doors ${count("door")}, windows ${count("window")}.`,
    ...planOverlaps(plan.places, plan.elements).map((warning) => `Warning: ${warning.message}`),
  ]
    .filter(Boolean)
    .join("\n");
}

// ── The preview ─────────────────────────────────────────────────────────────────────────────────────

const stateOf = (before: unknown, after: unknown): PlanDiffState =>
  before === undefined ? "added" : after === undefined ? "removed" : JSON.stringify(before) === JSON.stringify(after) ? "same" : "changed";

/** The `plan-diff` preview: the floor after the change, with what was added, changed or removed marked. */
export function planDiff(floorName: string, before: EditDoc, after: EditDoc, markers?: PlanDiffData["markers"]): PlanDiffData {
  const rooms: PlanDiffData["rooms"] = [];
  const oldPlaces = new Map(before.places.map((place) => [place.key, place]));
  const newKeys = new Set(after.places.map((place) => place.key));
  for (const place of after.places) {
    const old = oldPlaces.get(place.key);
    if (!place.polygon) {
      if (old?.polygon) rooms.push({ name: place.name, color: place.color, state: "removed", points: old.polygon.map(toTuple) });
      continue;
    }
    const state = old?.polygon ? stateOf(old.polygon, place.polygon) : "added";
    rooms.push({ name: place.name, color: place.color, state: state === "same" && old?.name !== place.name ? "changed" : state, points: place.polygon.map(toTuple), ...(state === "changed" && old?.polygon && { before: old.polygon.map(toTuple) }) });
  }
  for (const place of before.places) {
    if (!newKeys.has(place.key) && place.polygon) rooms.push({ name: place.name, color: place.color, state: "removed", points: place.polygon.map(toTuple) });
  }

  const walls: PlanDiffData["walls"] = [];
  const openings: PlanDiffData["openings"] = [];
  const shapeOf = (doc: EditDoc) => {
    const wallMap = new Map(doc.elements.flatMap((element) => (element.kind === "wall" ? [[element.id, element] as const] : [])));
    const shapes = new Map<string, PlanDiffData["openings"][number]>();
    for (const element of doc.elements) {
      if (element.kind === "wall") continue;
      const wall = wallMap.get(element.wallId);
      if (!wall) continue;
      const shape = openingShape(wall, element);
      shapes.set(element.id, {
        kind: element.kind,
        a: toTuple(shape.start),
        b: toTuple(shape.end),
        ...(element.kind === "door" && { hinge: toTuple(shape.hinge), tip: toTuple(shape.leafTip) }),
        state: "same",
      });
    }
    return { wallMap, shapes };
  };
  const old = shapeOf(before);
  const next = shapeOf(after);
  for (const [id, wall] of next.wallMap) {
    const previous = old.wallMap.get(id);
    walls.push({ a: toTuple(wall.a), b: toTuple(wall.b), thickness: wall.thickness, state: stateOf(previous && { a: previous.a, b: previous.b, t: previous.thickness }, { a: wall.a, b: wall.b, t: wall.thickness }) });
  }
  for (const [id, wall] of old.wallMap) if (!next.wallMap.has(id)) walls.push({ a: toTuple(wall.a), b: toTuple(wall.b), thickness: wall.thickness, state: "removed" });
  for (const [id, shape] of next.shapes) {
    const previous = old.shapes.get(id);
    openings.push({ ...shape, state: stateOf(previous, shape) });
  }
  for (const [id, shape] of old.shapes) if (!next.shapes.has(id)) openings.push({ ...shape, state: "removed" });

  return { floor: floorName, north: after.north, rooms, walls, openings, ...(markers?.length && { markers }) };
}

/** Rough direction words for results: "east of Living". */
export function relationText(side: Side, refName: string): string {
  if (side === "above" || side === "below") return `${side} ${refName}`;
  return `${side} of ${refName}`;
}

const SIDE_NL: Record<Side, string> = { north: "noord", east: "oost", south: "zuid", west: "west", above: "boven", below: "onder", left: "links", right: "rechts" };
/** The side in Dutch, for confirmation cards: "noord", "links". */
export const sideNl = (side: Side) => SIDE_NL[side];

/** "ten oosten van Keuken", "rechts van Keuken", "boven Keuken". */
export function relationTextNl(side: Side, refName: string): string {
  if (side === "above" || side === "below") return `${SIDE_NL[side]} ${refName}`;
  if (side === "left" || side === "right") return `${SIDE_NL[side]} van ${refName}`;
  return `ten ${SIDE_NL[side]}en van ${refName}`;
}

export { boundsOf };
