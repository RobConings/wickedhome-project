import type { Opening, PlanElement, Point, Wall } from "./places";

// Plan geometry in centimetres. Pure functions, shared by the editor canvas, the tools panel, the
// thumbnail and the assistant's drawing tools (ai/skills/floorplan), so both draw by the same rules.

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const snapValue = (value: number, step: number) => Math.round(value / step) * step;

export const snapPoint = (point: Point, step: number): Point => ({
  x: snapValue(point.x, step),
  y: snapValue(point.y, step),
});

export const roundPoint = (point: Point): Point => ({ x: Math.round(point.x), y: Math.round(point.y) });

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export const translate = (point: Point, dx: number, dy: number): Point => ({ x: point.x + dx, y: point.y + dy });

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Closest point on segment a–b to `point`, with `t` (0…1) along the segment. */
export function projectOnSegment(point: Point, a: Point, b: Point) {
  const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2));
  const projected = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return { t, point: projected, distance: distance(point, projected) };
}

export function boundsOf(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;
  return points.reduce<Bounds>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/** Visual centre of a polygon (area-weighted centroid), used to place its label. */
export function polygonCentroid(points: readonly Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    const cross = point.x * next.y - next.x * point.y;
    area += cross;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  });
  if (Math.abs(area) < 1e-9) {
    const bounds = boundsOf(points);
    return bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };
  }
  return { x: x / (3 * area), y: y / (3 * area) };
}

/** Ray casting: is `point` inside the polygon? */
export function isPointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export const wallLength = (wall: Pick<Wall, "a" | "b">) => distance(wall.a, wall.b);

/** Unit vectors along the wall and perpendicular to it. */
function wallAxes(wall: Pick<Wall, "a" | "b">) {
  const length = wallLength(wall) || 1;
  const along = { x: (wall.b.x - wall.a.x) / length, y: (wall.b.y - wall.a.y) / length };
  return { along, normal: { x: -along.y, y: along.x } };
}

export function pointAlongWall(wall: Pick<Wall, "a" | "b">, offset: number): Point {
  const { along } = wallAxes(wall);
  return { x: wall.a.x + along.x * offset, y: wall.a.y + along.y * offset };
}

/**
 * The wall as a filled rectangle: four corners, `thickness` wide around the centre line. With `caps`, both
 * ends stick out by half the thickness (like a square line cap), so walls meeting at a corner close it.
 */
export function wallOutline(wall: Wall, { caps = false }: { caps?: boolean } = {}): Point[] {
  const { along, normal } = wallAxes(wall);
  const half = wall.thickness / 2;
  const n = { x: normal.x * half, y: normal.y * half };
  const cap = caps ? half : 0;
  const a = translate(wall.a, -along.x * cap, -along.y * cap);
  const b = translate(wall.b, along.x * cap, along.y * cap);
  return [translate(a, n.x, n.y), translate(b, n.x, n.y), translate(b, -n.x, -n.y), translate(a, -n.x, -n.y)];
}

/**
 * Face-aligned walls: the user clicks along one face of the wall (the architect's line) and the centre line
 * sits half the thickness to the side. `left`/`right` are seen in the drawing direction, on screen (y down).
 * Returns the offset from the clicked line to the centre line.
 */
export function faceOffset(a: Point, b: Point, thickness: number, alignment: "center" | "left" | "right"): Point {
  const length = distance(a, b);
  if (alignment === "center" || length === 0) return { x: 0, y: 0 };
  const along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  // With y pointing down, (along.y, -along.x) points to the left of the drawing direction.
  const side = alignment === "left" ? 1 : -1;
  const half = (thickness / 2) * side;
  return { x: along.y * half, y: -along.x * half };
}

/**
 * Where the centre lines of two face-aligned walls meet: the wall along p→q (thickness `t1`) and the one
 * along q→r (`t2`). Falls back to the plain offset when the walls are (nearly) in line or the corner is so
 * sharp that the mitre would shoot far away.
 */
export function mitreCorner(p: Point, q: Point, r: Point, t1: number, t2: number, alignment: "center" | "left" | "right"): Point {
  const o1 = faceOffset(p, q, t1, alignment);
  const o2 = faceOffset(q, r, t2, alignment);
  const fallback = translate(q, o2.x, o2.y);
  const l1 = distance(p, q);
  const l2 = distance(q, r);
  if (l1 === 0 || l2 === 0) return fallback;
  const d1 = { x: (q.x - p.x) / l1, y: (q.y - p.y) / l1 };
  const d2 = { x: (r.x - q.x) / l2, y: (r.y - q.y) / l2 };
  const denominator = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denominator) < 1e-6) return fallback;
  const start1 = translate(q, o1.x, o1.y);
  const between = { x: fallback.x - start1.x, y: fallback.y - start1.y };
  const t = (between.x * d2.y - between.y * d2.x) / denominator;
  const corner = { x: start1.x + d1.x * t, y: start1.y + d1.y * t };
  return distance(corner, q) > 3 * Math.max(t1, t2) ? fallback : corner;
}

/** Keeps an opening inside its wall. Returns null when the wall is shorter than the opening. */
export function clampOpeningOffset(wall: Wall, width: number, offset: number): number | null {
  const length = wallLength(wall);
  if (length < width) return null;
  return Math.round(Math.max(width / 2, Math.min(length - width / 2, offset)));
}

/** Geometry to draw a door or window: the gap in the wall and, for doors, the leaf and swing arc. */
export function openingShape(wall: Wall, opening: Opening) {
  const { along, normal } = wallAxes(wall);
  const centre = pointAlongWall(wall, opening.offset);
  const half = opening.width / 2;
  const start = translate(centre, -along.x * half, -along.y * half);
  const end = translate(centre, along.x * half, along.y * half);
  const gap = wallOutline({ ...wall, a: start, b: end, thickness: wall.thickness + 2 });

  const door = opening.kind === "door" ? opening : null;
  const hinge = door?.hingeAtEnd ? end : start;
  const free = door?.hingeAtEnd ? start : end;
  const side = door?.swingFlipped ? -1 : 1;
  const leafTip = translate(hinge, normal.x * opening.width * side, normal.y * opening.width * side);
  // SVG arc sweep flag for the quarter circle from the open leaf back to the closed position: with y
  // pointing down, a positive cross product means clockwise.
  const cross = (leafTip.x - hinge.x) * (free.y - hinge.y) - (leafTip.y - hinge.y) * (free.x - hinge.x);
  const sweep = cross > 0 ? 1 : 0;

  return { centre, start, end, gap, hinge, free, leafTip, sweep, normal };
}

/** Closest wall to `point` within `tolerance` cm (beyond its half thickness), with the offset along it. */
export function findWallAt(walls: readonly Wall[], point: Point, tolerance: number) {
  let best: { wall: Wall; offset: number; distance: number } | null = null;
  for (const wall of walls) {
    const projection = projectOnSegment(point, wall.a, wall.b);
    const reach = wall.thickness / 2 + tolerance;
    if (projection.distance <= reach && (!best || projection.distance < best.distance)) {
      best = { wall, offset: projection.t * wallLength(wall), distance: projection.distance };
    }
  }
  return best;
}

/** After walls move, doors and windows slide back inside their (possibly shorter) wall. */
export function keepOpeningsInWalls(elements: readonly PlanElement[]): PlanElement[] {
  const walls = new Map(elements.flatMap((element) => (element.kind === "wall" ? [[element.id, element] as const] : [])));
  return elements.map((element) => {
    if (element.kind === "wall") return element;
    const wall = walls.get(element.wallId);
    const offset = wall ? clampOpeningOffset(wall, element.width, element.offset) : null;
    return offset === null || offset === element.offset ? element : { ...element, offset };
  });
}

/** Removes an element; removing a wall also removes the doors and windows in it. */
export const withoutElement = (elements: readonly PlanElement[], id: string): PlanElement[] =>
  elements.filter((element) => element.id !== id && (element.kind === "wall" || element.wallId !== id));

/** Ids for new plan elements. `crypto.randomUUID` needs a secure context, which the LAN dev URL is not. */
export function newElementId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `pe${Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("")}`;
}
