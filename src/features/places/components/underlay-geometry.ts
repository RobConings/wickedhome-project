import type { FloorUnderlay, Point, UnderlayRect } from "../types/places";
import { isPointInPolygon, polygonCentroid } from "./floor-plan-geometry";

// Placing the imported plan on the floor plan, and calibrating its scale. Pure functions (unit tested).
//
// Underlay units (PDF points or image pixels) map to plan centimetres like this: take a point relative to
// the crop's centre, multiply by `scale`, rotate by `rotation` (clockwise on screen, y down) and move it
// to `center`. Rotating therefore turns the plan around its middle, and calibrating keeps one point still.

type Placement = Pick<FloorUnderlay, "crop" | "scale" | "rotation" | "center">;

/** 1 PDF point is 1/72 inch. */
export const POINTS_PER_INCH = 72;
export const CM_PER_INCH = 2.54;

/** Drawing scales offered for vector PDFs (1:20 … 1:500). */
export const DRAWING_SCALES = [20, 50, 100, 200, 500] as const;

/** Most Belgian building plans are drawn at 1:50: the first guess for a freshly imported PDF. */
export const DEFAULT_DRAWING_SCALE = 50;

/** Centimetres per PDF point on a drawing at 1:`ratio` (1:50 → 1,764 cm per point). */
export const cmPerPointAtScale = (ratio: number) => (ratio * CM_PER_INCH) / POINTS_PER_INCH;

/** The drawing scale (the `x` in 1:x) that a PDF underlay's scale corresponds to. */
export const drawingRatio = (scale: number) => (scale * POINTS_PER_INCH) / CM_PER_INCH;

/** Area difference above which the drawn area and the architect's area disagree. */
export const AREA_TOLERANCE = 0.03;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Keeps a rotation in (-180, 180]. */
export function normalizeRotation(degrees: number): number {
  let value = degrees % 360;
  if (value <= -180) value += 360;
  if (value > 180) value -= 360;
  return Math.round(value * 1000) / 1000;
}

/** A point on the underlay (underlay units, relative to the crop's top-left) → plan cm. */
export function underlayToWorld(placement: Placement, local: Point): Point {
  const { crop, scale, rotation, center } = placement;
  const dx = (local.x - crop.width / 2) * scale;
  const dy = (local.y - crop.height / 2) * scale;
  const cos = Math.cos(radians(rotation));
  const sin = Math.sin(radians(rotation));
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Plan cm → a point on the underlay (underlay units, relative to the crop's top-left). */
export function worldToUnderlay(placement: Placement, world: Point): Point {
  const { crop, scale, rotation, center } = placement;
  const cos = Math.cos(radians(rotation));
  const sin = Math.sin(radians(rotation));
  const x = world.x - center.x;
  const y = world.y - center.y;
  return { x: (x * cos + y * sin) / scale + crop.width / 2, y: (-x * sin + y * cos) / scale + crop.height / 2 };
}

/** SVG transform that draws the crop (an image of crop.width × crop.height) at its place on the plan. */
export function underlayTransform({ crop, scale, rotation, center }: Placement): string {
  return `translate(${center.x} ${center.y}) rotate(${rotation}) scale(${scale}) translate(${-crop.width / 2} ${-crop.height / 2})`;
}

/** The four corners of the underlay on the plan, for fitting the view. */
export function underlayCorners(placement: Placement): Point[] {
  const { width, height } = placement.crop;
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((corner) => underlayToWorld(placement, corner));
}

/** Moves the underlay so that `local` (underlay units) lands on `world` again after a change. */
function keepPointStill<T extends Placement>(next: T, local: Point, world: Point): T {
  const moved = underlayToWorld(next, local);
  return { ...next, center: { x: next.center.x + world.x - moved.x, y: next.center.y + world.y - moved.y } };
}

/**
 * Two-point calibration: the line from `a` to `b` (plan cm, as clicked on the underlay) really is
 * `realCm` long. Returns the underlay rescaled so it is, with `a` staying where it was; null when the two
 * points coincide or the length isn't positive.
 */
export function calibrateTwoPoint<T extends Placement>(underlay: T, a: Point, b: Point, realCm: number): (T & { calibrated: true }) | null {
  const localA = worldToUnderlay(underlay, a);
  const localB = worldToUnderlay(underlay, b);
  const units = Math.hypot(localB.x - localA.x, localB.y - localA.y);
  if (units < 1e-9 || !(realCm > 0)) return null;
  return { ...keepPointStill({ ...underlay, scale: realCm / units }, localA, a), calibrated: true };
}

/**
 * Drawing scale for a vector PDF (1:50, 1:100…): computed from PDF points, no clicking. `anchor` (plan cm)
 * stays where it is; the underlay's centre by default.
 */
export function applyDrawingScale<T extends Placement>(underlay: T, ratio: number, anchor: Point = underlay.center): T & { calibrated: true } {
  const local = worldToUnderlay(underlay, anchor);
  return { ...keepPointStill({ ...underlay, scale: cmPerPointAtScale(ratio) }, local, anchor), calibrated: true };
}

/** Sets the rotation (degrees), turning around the underlay's centre. */
export const rotateUnderlay = <T extends Placement>(underlay: T, rotation: number): T => ({ ...underlay, rotation: normalizeRotation(rotation) });

/** First scale before calibration: 1:50 for a PDF, about 15 m wide for an image. */
export const initialUnderlayScale = (unit: FloorUnderlay["unit"], crop: UnderlayRect) =>
  unit === "pt" ? cmPerPointAtScale(DEFAULT_DRAWING_SCALE) : 1500 / crop.width;

/** The PDF's room labels at their place on the plan. */
export function labelsOnPlan(underlay: FloorUnderlay) {
  return underlay.labels.map((label) => ({ ...label, at: underlayToWorld(underlay, { x: label.u, y: label.v }) }));
}

/** The PDF label inside a room's outline (the one nearest its middle), if any. */
export function labelInside(underlay: FloorUnderlay | null | undefined, polygon: readonly Point[]) {
  if (!underlay || polygon.length < 3) return null;
  const middle = polygonCentroid(polygon);
  const inside = labelsOnPlan(underlay).filter((label) => isPointInPolygon(label.at, polygon));
  inside.sort((a, b) => Math.hypot(a.at.x - middle.x, a.at.y - middle.y) - Math.hypot(b.at.x - middle.x, b.at.y - middle.y));
  return inside[0] ?? null;
}

/** Drawn area vs the architect's: the relative difference and whether it is within 3 %. */
export function compareArea(drawnM2: number, planM2: number) {
  const difference = planM2 > 0 ? (drawnM2 - planM2) / planM2 : Infinity;
  return { difference, matches: Math.abs(difference) <= AREA_TOLERANCE };
}
