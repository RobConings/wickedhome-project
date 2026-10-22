import type { Point } from "./places";

const EPS = 1e-7;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const edges = (polygon: readonly Point[]) => polygon.map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length]! }));

/** A simple, non-degenerate outline; the closing corner is implicit. */
export function isSimplePolygon(polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;
  const segments = edges(polygon);
  let area = 0;
  for (let i = 0; i < segments.length; i++) {
    const { a, b } = segments[i]!;
    if (a.x === b.x && a.y === b.y) return false;
    area += a.x * b.y - b.x * a.y;
    const next = segments[(i + 1) % segments.length]!.b;
    // Adjacent edges may continue straight, but cannot double back.
    if (Math.abs(cross(a, b, next)) < EPS && (b.x - a.x) * (next.x - b.x) + (b.y - a.y) * (next.y - b.y) < 0) return false;
    for (let j = i + 1; j < segments.length; j++) {
      if (j === i + 1 || (i === 0 && j === segments.length - 1)) continue;
      const { a: c, b: d } = segments[j]!;
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
          Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
      if (cross(a, b, c) * cross(a, b, d) <= EPS && cross(c, d, a) * cross(c, d, b) <= EPS) return false;
    }
  }
  return Math.abs(area) > EPS;
}

/**
 * Actual intersection area in cm², including concave outlines. Between vertex/crossing heights,
 * horizontal intersection widths are linear, so their midpoint integrates each strip exactly.
 */
export function polygonIntersectionArea(first: readonly Point[], second: readonly Point[]): number {
  const aEdges = edges(first);
  const bEdges = edges(second);
  const heights = new Set([...first, ...second].map((point) => point.y));
  for (const { a, b } of aEdges) {
    for (const { a: c, b: d } of bEdges) {
      const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(denominator) < EPS) continue;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
      if (t > 0 && t < 1 && u > 0 && u < 1) heights.add(a.y + t * (b.y - a.y));
    }
  }
  const intervals = (segments: ReturnType<typeof edges>, y: number) => segments
    .filter(({ a, b }) => (a.y > y) !== (b.y > y))
    .map(({ a, b }) => a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y))
    .sort((a, b) => a - b);
  const sorted = [...heights].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < sorted.length; i++) {
    const low = sorted[i - 1]!;
    const high = sorted[i]!;
    const y = (low + high) / 2;
    const a = intervals(aEdges, y);
    const b = intervals(bEdges, y);
    let width = 0;
    for (let j = 0; j + 1 < a.length; j += 2) {
      for (let k = 0; k + 1 < b.length; k += 2) width += Math.max(0, Math.min(a[j + 1]!, b[k + 1]!) - Math.max(a[j]!, b[k]!));
    }
    area += width * (high - low);
  }
  return area;
}
