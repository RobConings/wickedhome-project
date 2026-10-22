import type { FloorUnderlay, Point } from "../types/places";
import { worldToUnderlay } from "./underlay-geometry";

// Plan orientation: where true north is on the plan, and turning the plan import's preview in quarter
// turns. Pure functions (unit tested in plan-orientation.test.ts).
//
// Angles are degrees clockwise on screen (y down), measured from the plan's "up". North is one value for
// the whole household: `north = 0` means north is up, `north = 90` means north points to the right.

/** Keeps an angle in [0, 360), rounded to 0,1°. */
export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const value = Math.round((((degrees % 360) + 360) % 360) * 10) / 10;
  return value >= 360 ? 0 : value;
}

/** Direction of the line from `tail` to `tip` (y down), clockwise from up; null when they coincide. */
export function angleFromPoints(tail: Point, tip: Point): number | null {
  const dx = tip.x - tail.x;
  const dy = tip.y - tail.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  return normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * North from the architect's north arrow, clicked on the plan (tail → tip, in plan cm). The arrow is read
 * on the sheet itself (underlay units) and the underlay's rotation is added, so the result is north in the
 * plan's coordinates. Without an underlay the clicked direction is taken as it is.
 */
export function northFromArrow(underlay: Pick<FloorUnderlay, "crop" | "scale" | "rotation" | "center"> | null, tail: Point, tip: Point): number | null {
  if (!underlay) return angleFromPoints(tail, tip);
  const onSheet = angleFromPoints(worldToUnderlay(underlay, tail), worldToUnderlay(underlay, tip));
  return onSheet === null ? null : normalizeDegrees(onSheet + underlay.rotation);
}

/** The compass direction the top of the plan faces (0 = north, 90 = east), for a given north. */
export const topFacing = (north: number) => normalizeDegrees(360 - north);

/** North from the direction the top of the plan faces (the inverse of `topFacing`). */
export const northFromTopFacing = (facing: number) => normalizeDegrees(360 - facing);

/** The eight compass points, clockwise from north (translated as `orientation.points.<key>`). */
export const COMPASS_POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** The nearest of the eight compass points to an azimuth (degrees clockwise from north). */
export const compassPoint = (azimuth: number): CompassPoint => COMPASS_POINTS[Math.round(normalizeDegrees(azimuth) / 45) % 8] ?? "n";

/**
 * Where a compass direction (`azimuth`, clockwise from true north) points on screen: clockwise from the
 * screen's up, for a plan with this north drawn turned by `viewRotation` degrees.
 */
export const screenAngle = (north: number, azimuth: number, viewRotation = 0) => normalizeDegrees(north + azimuth + viewRotation);

/** Turns a point around the origin by `degrees` clockwise (y down). */
export function rotatePoint(point: Point, degrees: number): Point {
  if (degrees === 0) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

// Quarter turns in the plan import's crop step ----------------------------------------------------------
// The preview shows the page turned by 0, 90, 180 or 270° clockwise. Selections are made on the turned
// preview but stored on the page itself (fractions 0–1 of its width and height), so the crop stays in
// underlay units and the turn becomes the underlay's rotation.

/** A rotation rounded to the nearest quarter turn, as 0, 90, 180 or 270. */
export const quarterTurn = (degrees: number) => (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;

type Fraction = { x: number; y: number };
type FractionRect = { x: number; y: number; width: number; height: number };

/** A point on the turned preview (fractions of its width and height) → the same point on the page. */
export function previewToPage(point: Fraction, quarter: number): Fraction {
  switch (quarterTurn(quarter)) {
    case 90:
      return { x: point.y, y: 1 - point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: 1 - point.y, y: point.x };
    default:
      return point;
  }
}

/** A point on the page (fractions) → where it shows on the turned preview. */
export function pageToPreview(point: Fraction, quarter: number): Fraction {
  switch (quarterTurn(quarter)) {
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

function mapRect(rect: FractionRect, map: (point: Fraction) => Fraction): FractionRect {
  const a = map({ x: rect.x, y: rect.y });
  const b = map({ x: rect.x + rect.width, y: rect.y + rect.height });
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** A rectangle on the turned preview → the same rectangle on the page (fractions). */
export const previewRectToPage = (rect: FractionRect, quarter: number) => mapRect(rect, (point) => previewToPage(point, quarter));

/** A rectangle on the page → where it shows on the turned preview (fractions). */
export const pageRectToPreview = (rect: FractionRect, quarter: number) => mapRect(rect, (point) => pageToPreview(point, quarter));
