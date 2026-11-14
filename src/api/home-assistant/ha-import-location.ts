import type { Place, Point } from "@/features/places/types/places";
import { boundsOf, isPointInPolygon, polygonCentroid } from "@/features/places/types/plan-geometry";

/** Ambiguous room names stay unassigned; imports never guess a different floor. */
export function matchHaRoom(area: string | null, places: readonly Place[]): Place | null {
  if (!area) return null;
  const matches = places.filter((place) => place.name.trim().toLocaleLowerCase("nl-BE") === area.trim().toLocaleLowerCase("nl-BE"));
  return matches.length === 1 ? matches[0]! : null;
}

/** Room-level initial placement, explicitly adjustable by the user afterward. */
export function initialHaPosition(polygon: readonly Point[] | null, index: number): Point | null {
  if (!polygon || polygon.length < 3) return null;
  const center = polygonCentroid(polygon);
  const offset = { x: ((index % 3) - 1) * 45, y: (Math.floor(index / 3) % 3 - 1) * 45 };
  const candidate = { x: Math.round(center.x + offset.x), y: Math.round(center.y + offset.y) };
  if (isPointInPolygon(candidate, polygon)) return candidate;
  if (isPointInPolygon(center, polygon)) return { x: Math.round(center.x), y: Math.round(center.y) };
  const bounds = boundsOf(polygon);
  if (!bounds) return null;
  for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
    const point = { x: Math.round(bounds.minX + (bounds.maxX - bounds.minX) * x / 20), y: Math.round(bounds.minY + (bounds.maxY - bounds.minY) * y / 20) };
    if (isPointInPolygon(point, polygon)) return point;
  }
  return null;
}
