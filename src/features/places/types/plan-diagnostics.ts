import type { PlanElement, Point, Wall } from "./places";
import { boundsOf, wallLength, wallOutline } from "./plan-geometry";
import { polygonIntersectionArea } from "./polygon-geometry";

export type PlanOverlap = {
  kind: "room_overlap" | "wall_overlap" | "room_wall_overlap";
  first: string;
  second: string;
  /** Overlap area for room/room and room/wall, shared length for wall/wall, in cm² / cm. */
  amount: number;
  message: string;
};

/** Non-blocking diagnostics shared by the drawing editor and the AI tools. Normal wall joins are fine. */
export function planOverlaps(places: readonly { name: string; polygon: Point[] | null }[], elements: readonly PlanElement[]): PlanOverlap[] {
  const warnings: PlanOverlap[] = [];
  const rooms = places.flatMap((place) => place.polygon ? [{ ...place, polygon: place.polygon, bounds: boundsOf(place.polygon)! }] : []);
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i]!;
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j]!;
      if (Math.min(a.bounds.maxX, b.bounds.maxX) <= Math.max(a.bounds.minX, b.bounds.minX) || Math.min(a.bounds.maxY, b.bounds.maxY) <= Math.max(a.bounds.minY, b.bounds.minY)) continue;
      const area = polygonIntersectionArea(a.polygon, b.polygon);
      if (area > 1e-7) warnings.push({ kind: "room_overlap", first: a.name, second: b.name, amount: area, message: `Rooms ${a.name} and ${b.name} overlap by ${Math.round(area)} cm².` });
    }
  }
  const walls = elements.filter((element): element is Wall => element.kind === "wall" && wallLength(element) > 0);
  const wallShapes = new Map(walls.map((wall) => [wall.id, wallOutline(wall, { caps: true })]));
  const wallBounds = new Map(walls.map((wall) => [wall.id, boundsOf(wallShapes.get(wall.id)!)!]));
  const intersectBounds = (a: NonNullable<ReturnType<typeof boundsOf>>, b: NonNullable<ReturnType<typeof boundsOf>>) =>
    Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX) && Math.min(a.maxY, b.maxY) > Math.max(a.minY, b.minY);
  for (const room of rooms) {
    for (const wall of walls) {
      if (!intersectBounds(room.bounds, wallBounds.get(wall.id)!)) continue;
      const area = polygonIntersectionArea(room.polygon, wallShapes.get(wall.id)!);
      if (area > 1e-7) warnings.push({ kind: "room_wall_overlap", first: room.name, second: wall.id, amount: area, message: `Wall ${wall.id} intrudes into the inner outline of room ${room.name} (${Math.round(area)} cm²). Check wall thickness and the room's inner faces.` });
    }
  }
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i]!;
    const length = wallLength(a);
    const dx = (a.b.x - a.a.x) / length;
    const dy = (a.b.y - a.a.y) / length;
    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j]!;
      if (!intersectBounds(wallBounds.get(a.id)!, wallBounds.get(b.id)!)) continue;
      const bLength = wallLength(b);
      const bx = (b.b.x - b.a.x) / bLength;
      const by = (b.b.y - b.a.y) / bLength;
      const cross = dx * by - dy * bx;
      let overlap = 0;
      if (Math.abs(cross) < 1e-7) {
        const separation = Math.abs(dx * (b.a.y - a.a.y) - dy * (b.a.x - a.a.x));
        if (separation >= (a.thickness + b.thickness) / 2 - 1e-7) continue;
        const start = dx * (b.a.x - a.a.x) + dy * (b.a.y - a.a.y);
        const end = dx * (b.b.x - a.a.x) + dy * (b.b.y - a.a.y);
        overlap = Math.min(length, Math.max(start, end)) - Math.max(0, Math.min(start, end));
      } else {
        // An interior crossing is suspicious; endpoint/corner and T-junction joins are expected.
        const t = ((b.a.x - a.a.x) * by - (b.a.y - a.a.y) * bx) / cross;
        const u = ((b.a.x - a.a.x) * dy - (b.a.y - a.a.y) * dx) / cross;
        if (t > b.thickness / 2 && t < length - b.thickness / 2 && u > a.thickness / 2 && u < bLength - a.thickness / 2) overlap = Math.min(a.thickness, b.thickness);
      }
      if (overlap > 1e-7) warnings.push({ kind: "wall_overlap", first: a.id, second: b.id, amount: overlap, message: `Walls ${a.id} and ${b.id} overlap or cross along their interiors (${Math.round(overlap)} cm).` });
    }
  }
  return warnings;
}
