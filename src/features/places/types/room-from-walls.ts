import type { PlanElement, Point, Wall } from "./places";

// "Fill room": the room around a click, from the walls' inner faces. Pure functions (unit tested).
//
// 1. Every wall becomes a solid quadrilateral (its centre line ± half the thickness). Ends that meet
//    another wall's end get a square cap (closing corners). Ends inside another wall (T-junctions) stay as
//    they are. Loose ends are bridged to a wall within the gap tolerance (a traced line stopping 3 cm short
//    still closes the room); ends that can't be bridged are the gaps reported when a room is open.
// 2. The union of those shapes is built exactly: all edges are split where they cross, and pieces inside
//    another wall (or shared by two touching walls) are dropped. What remains is the outline of the walls.
// 3. That outline is walked as a planar graph with free space on the left. Each closed walk with positive
//    area is a hole in the walls: a room. The smallest one around the click is the answer.
//
// Doors and windows are openings drawn in a wall; the wall itself is continuous, so rooms never leak
// through them. Free-standing walls inside a room (islands) are not cut out of its outline.

type Vec = { x: number; y: number };

export type RoomFromWallsResult =
  | { ok: true; polygon: Point[] }
  /**
   * `no-walls`: nothing to fill from. `on-wall`: the click is on a wall. `open`: no closed room around the
   * click; `gaps` are the loose wall ends nearest to it (where the room leaks).
   */
  | { ok: false; reason: "no-walls" | "on-wall" | "open"; gaps: Point[] };

export type RoomFromWallsOptions = {
  /** Gaps up to this many cm between a wall end and another wall are closed. */
  gapTolerance?: number;
};

export const DEFAULT_GAP_TOLERANCE = 5;
/** Gap tolerances offered in the editor, in cm. */
export const GAP_TOLERANCES = [0, 2, 5, 10, 20] as const;

const EPS = 1e-6;
/** Wall ends this close (cm) count as the same corner. */
const JOIN_DISTANCE = 0.5;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
const len = (a: Vec) => Math.hypot(a.x, a.y);
const dist = (a: Vec, b: Vec) => len(sub(a, b));

/** Signed area (positive: the interior is on the side where `cross > 0`). */
function signedArea(points: readonly Vec[]): number {
  let twice = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]!;
    twice += point.x * next.y - next.x * point.y;
  });
  return twice / 2;
}

function pointInPolygon(point: Vec, polygon: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: Vec, a: Vec, b: Vec) {
  const ab = sub(b, a);
  const length2 = dot(ab, ab);
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(point, a), ab) / length2));
  const closest = add(a, mul(ab, t));
  return { distance: dist(point, closest), closest };
}

// Step 1: walls → solid shapes -------------------------------------------------------------------------------

type Segment = { a: Vec; b: Vec; half: number };

/** A convex quadrilateral around a segment, ends extended by `extA` / `extB`, positively oriented. */
function quad({ a, b, half }: Segment, extA: number, extB: number): Vec[] {
  const length = dist(a, b);
  const along = mul(sub(b, a), 1 / length);
  const normal = { x: -along.y, y: along.x };
  const start = sub(a, mul(along, extA));
  const end = add(b, mul(along, extB));
  const n = mul(normal, half);
  const points = [add(start, n), add(end, n), sub(end, n), sub(start, n)];
  return signedArea(points) < 0 ? points.reverse() : points;
}

/** Strictly inside a convex, positively oriented polygon (with a margin). */
function insideConvex(point: Vec, polygon: readonly Vec[], margin = EPS): boolean {
  return polygon.every((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!;
    const edge = sub(end, start);
    return cross(edge, sub(point, start)) / len(edge) > margin;
  });
}

/** Distance along the ray from `origin` (unit `direction`) to where it enters and leaves a convex polygon. */
function rayThroughConvex(origin: Vec, direction: Vec, polygon: readonly Vec[]): { enter: number; exit: number } | null {
  let enter = -Infinity;
  let exit = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]!;
    const end = polygon[(index + 1) % polygon.length]!;
    const edge = sub(end, start);
    // Inside means cross(edge, p - start) >= 0; along the ray that is c0 + t·c1 >= 0.
    const c0 = cross(edge, sub(origin, start));
    const c1 = cross(edge, direction);
    if (Math.abs(c1) < 1e-12) {
      if (c0 < 0) return null;
      continue;
    }
    const t = -c0 / c1;
    if (c1 > 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return enter <= exit && exit > 0 ? { enter, exit } : null;
}

type WallEnd = { wall: number; end: "a" | "b"; point: Vec; outward: Vec };

/** The solid shapes of the walls, plus the loose ends that could not be bridged. */
function wallSolids(walls: readonly Wall[], tolerance: number): { solids: Vec[][]; loose: Vec[] } {
  const segments: Segment[] = walls.map((wall) => ({ a: wall.a, b: wall.b, half: wall.thickness / 2 }));
  // Plain capped bodies, used to test where a wall end is.
  const bodies = segments.map((segment) => quad(segment, segment.half, segment.half));
  const ends: WallEnd[] = segments.flatMap((segment, wall) => {
    const along = mul(sub(segment.b, segment.a), 1 / dist(segment.a, segment.b));
    return [
      { wall, end: "a" as const, point: segment.a, outward: mul(along, -1) },
      { wall, end: "b" as const, point: segment.b, outward: along },
    ];
  });

  const extension = segments.map(() => ({ a: 0, b: 0 }));
  const bridges: Segment[] = [];
  const loose: Vec[] = [];

  for (const end of ends) {
    const segment = segments[end.wall]!;
    const others = segments.map((_, index) => index).filter((index) => index !== end.wall);
    // A corner: another wall ends here too. Square caps close it.
    const corner = ends.some((other) => other.wall !== end.wall && dist(other.point, end.point) <= JOIN_DISTANCE);
    if (corner) {
      extension[end.wall]![end.end] = segment.half;
      continue;
    }
    // A T-junction (or an overlap): the end sits inside another wall, nothing to add.
    if (others.some((index) => insideConvex(end.point, bodies[index]!, -JOIN_DISTANCE))) continue;

    // A loose end. Square cap like on screen, then try to reach a wall straight ahead…
    extension[end.wall]![end.end] = segment.half;
    let reach: number | null = null;
    for (const index of others) {
      const hit = rayThroughConvex(end.point, end.outward, bodies[index]!);
      if (!hit || hit.enter < -EPS || hit.enter - segment.half > tolerance) continue;
      // Into the middle of the other wall, so a slanted meeting leaves no notch.
      const into = (Math.max(hit.enter, 0) + hit.exit) / 2;
      reach = reach === null ? into : Math.min(reach, into);
    }
    if (reach !== null) {
      extension[end.wall]![end.end] = Math.max(segment.half, reach);
      continue;
    }
    // …or the nearest wall beside it.
    let nearest: { closest: Vec; gap: number } | null = null;
    for (const index of others) {
      const other = segments[index]!;
      const { distance, closest } = distanceToSegment(end.point, other.a, other.b);
      const gap = distance - other.half - segment.half;
      if (gap <= tolerance && (!nearest || gap < nearest.gap)) nearest = { closest, gap };
    }
    if (nearest && dist(nearest.closest, end.point) > EPS) {
      bridges.push({ a: end.point, b: nearest.closest, half: segment.half });
      continue;
    }
    loose.push({ x: end.point.x, y: end.point.y });
  }

  const solids = segments.map((segment, index) => quad(segment, extension[index]!.a, extension[index]!.b));
  for (const bridge of bridges) solids.push(quad(bridge, 0, 0));
  return { solids, loose };
}

// Step 2: the outline of the union -------------------------------------------------------------------------

type Edge = { start: Vec; end: Vec; solid: number; splits: { t: number; point: Vec }[] };

function unionOutline(solids: readonly Vec[][]): { start: Vec; end: Vec }[] {
  const edges: Edge[] = solids.flatMap((points, solid) =>
    points.map((start, index) => ({ start, end: points[(index + 1) % points.length]!, solid, splits: [] })),
  );
  const param = (edge: Edge, point: Vec) => {
    const direction = sub(edge.end, edge.start);
    return dot(sub(point, edge.start), direction) / dot(direction, direction);
  };

  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i]!;
    const r = sub(e1.end, e1.start);
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j]!;
      if (e1.solid === e2.solid) continue;
      const q = sub(e2.end, e2.start);
      const denominator = cross(r, q);
      const offset = sub(e2.start, e1.start);
      if (Math.abs(denominator) > 1e-9 * len(r) * len(q)) {
        const t = cross(offset, q) / denominator;
        const u = cross(offset, r) / denominator;
        const slackT = EPS / len(r);
        const slackU = EPS / len(q);
        if (t < -slackT || t > 1 + slackT || u < -slackU || u > 1 + slackU) continue;
        const point = add(e1.start, mul(r, Math.max(0, Math.min(1, t))));
        e1.splits.push({ t, point });
        e2.splits.push({ t: u, point });
      } else if (Math.abs(cross(offset, r)) / len(r) < EPS) {
        // Collinear: each edge is split where the other one starts and ends.
        for (const point of [e2.start, e2.end]) {
          const t = param(e1, point);
          if (t > 0 && t < 1) e1.splits.push({ t, point });
        }
        for (const point of [e1.start, e1.end]) {
          const t = param(e2, point);
          if (t > 0 && t < 1) e2.splits.push({ t, point });
        }
      }
    }
  }

  const kept: { start: Vec; end: Vec }[] = [];
  for (const edge of edges) {
    const stops = [{ t: 0, point: edge.start }, ...edge.splits, { t: 1, point: edge.end }].sort((a, b) => a.t - b.t);
    for (let index = 0; index < stops.length - 1; index++) {
      const start = stops[index]!.point;
      const end = stops[index + 1]!.point;
      if (dist(start, end) < EPS) continue;
      if (keepPiece(start, end, edge.solid, solids)) kept.push({ start, end });
    }
  }
  return kept;
}

/**
 * Is this piece of a solid's edge part of the union's outline? Not when it runs inside another solid, nor
 * when it is shared with a solid on the other side. Of two touching solids on the same side, one keeps it.
 */
function keepPiece(start: Vec, end: Vec, solid: number, solids: readonly Vec[][]): boolean {
  const middle = mul(add(start, end), 0.5);
  const direction = sub(end, start);
  for (let other = 0; other < solids.length; other++) {
    if (other === solid) continue;
    const polygon = solids[other]!;
    let inside = true;
    let onEdge: Vec | null = null;
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index]!;
      const b = polygon[(index + 1) % polygon.length]!;
      const edge = sub(b, a);
      const side = cross(edge, sub(middle, a)) / len(edge);
      if (side < -EPS) {
        inside = false;
        onEdge = null;
        break;
      }
      if (side <= EPS) onEdge = edge;
    }
    if (!inside) continue;
    if (!onEdge) return false;
    if (dot(onEdge, direction) < 0 || other < solid) return false;
  }
  return true;
}

// Step 3: walk the outline --------------------------------------------------------------------------------------

/** Closed walks of the outline with free space on the left; rooms are the ones with positive area. */
function freeSpaceLoops(outline: readonly { start: Vec; end: Vec }[]): Vec[][] {
  // Merge endpoints that are (numerically) the same point.
  const vertices: Vec[] = [];
  const grid = new Map<string, number[]>();
  const cell = (value: number) => Math.floor(value / 1e-3);
  function vertexId(point: Vec): number {
    const cx = cell(point.x);
    const cy = cell(point.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const id of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (dist(vertices[id]!, point) < 1e-4) return id;
        }
      }
    }
    vertices.push(point);
    const key = `${cx}:${cy}`;
    grid.set(key, [...(grid.get(key) ?? []), vertices.length - 1]);
    return vertices.length - 1;
  }

  // Reversed: the outline has walls on its left, the walk wants free space on its left.
  type Directed = { from: number; to: number; used: boolean };
  const directed: Directed[] = [];
  const outgoing = new Map<number, Directed[]>();
  for (const { start, end } of outline) {
    const from = vertexId(end);
    const to = vertexId(start);
    if (from === to) continue;
    const edge = { from, to, used: false };
    directed.push(edge);
    outgoing.set(from, [...(outgoing.get(from) ?? []), edge]);
  }

  const loops: Vec[][] = [];
  for (const first of directed) {
    if (first.used) continue;
    const loop: Vec[] = [];
    let current = first;
    let closed = false;
    for (let steps = 0; steps <= directed.length; steps++) {
      current.used = true;
      loop.push(vertices[current.from]!);
      const incoming = sub(vertices[current.to]!, vertices[current.from]!);
      // At a junction, turn as far left as possible: that keeps hugging the same free area.
      let next: Directed | null = null;
      let bestTurn = -Infinity;
      for (const candidate of outgoing.get(current.to) ?? []) {
        if (candidate.used && candidate !== first) continue;
        const direction = sub(vertices[candidate.to]!, vertices[candidate.from]!);
        let turn = Math.atan2(cross(incoming, direction), dot(incoming, direction));
        if (candidate.to === current.from && Math.abs(turn) > Math.PI - 1e-9) turn = -Math.PI;
        if (turn > bestTurn) {
          bestTurn = turn;
          next = candidate;
        }
      }
      if (!next) break;
      if (next === first) {
        closed = true;
        break;
      }
      current = next;
    }
    if (closed && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Clean-up ----------------------------------------------------------------------------------------------------

/** Drops points that sit on a straight line between their neighbours (within `tolerance` cm). */
function dropStraightPoints(points: Vec[], tolerance: number): Vec[] {
  let result = points;
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length && result.length > 3; index++) {
      const previous = result[(index - 1 + result.length) % result.length]!;
      const point = result[index]!;
      const next = result[(index + 1) % result.length]!;
      const tooClose = dist(previous, point) < tolerance;
      const straight = distanceToSegment(point, previous, next).distance < tolerance;
      if (tooClose || straight) {
        result = result.filter((_, i) => i !== index);
        changed = true;
        index--;
      }
    }
  }
  return result;
}

/** Whole centimetres, without repeated or straight-line points, at most 200 points. */
function tidyPolygon(points: Vec[]): Point[] {
  let tolerance = 0.5;
  let result = dropStraightPoints(points, tolerance);
  while (result.length > 200) {
    tolerance *= 2;
    result = dropStraightPoints(result, tolerance);
  }
  const rounded = result.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }));
  return dropStraightPoints(rounded, 0.01).map((point) => ({ x: point.x, y: point.y }));
}

// Public --------------------------------------------------------------------------------------------------------

/**
 * The room around `point` (plan cm), bounded by the walls' inner faces. Doors and windows don't matter:
 * they sit in walls. See the comment at the top of this file for how it works.
 */
export function findRoomAt(elements: readonly PlanElement[], point: Point, options: RoomFromWallsOptions = {}): RoomFromWallsResult {
  const tolerance = Math.max(0, options.gapTolerance ?? DEFAULT_GAP_TOLERANCE);
  const walls = elements.filter((element): element is Wall => element.kind === "wall" && dist(element.a, element.b) > EPS);
  if (walls.length === 0) return { ok: false, reason: "no-walls", gaps: [] };

  const { solids, loose } = wallSolids(walls, tolerance);
  if (solids.some((solid) => insideConvex(point, solid, 0))) return { ok: false, reason: "on-wall", gaps: [] };

  const rooms = freeSpaceLoops(unionOutline(solids))
    .map((loop) => ({ loop, area: signedArea(loop) }))
    .filter(({ loop, area }) => area > 1 && pointInPolygon(point, loop))
    .sort((a, b) => a.area - b.area);
  const room = rooms[0];
  if (!room) {
    const gaps = [...loose].sort((a, b) => dist(a, point) - dist(b, point)).slice(0, 8);
    return { ok: false, reason: "open", gaps };
  }
  const polygon = tidyPolygon(room.loop);
  if (polygon.length < 3) return { ok: false, reason: "open", gaps: [] };
  return { ok: true, polygon };
}
