/**
 * Unit tests for "Fill room": finding the room around a click from the walls. Run on the server:
 *
 *   npx tsx --test src/features/places/components/room-from-walls.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { polygonAreaCm2, type PlanElement, type Point, type Wall } from "../types/places";
import { findRoomAt } from "./room-from-walls";

let counter = 0;
const wall = (a: Point, b: Point, thickness: number): Wall => ({ id: `w${++counter}`, kind: "wall", a, b, thickness });

/** Walls along the points; `closed` adds the wall back to the start. */
function chain(points: Point[], thickness: number, closed = true): Wall[] {
  const walls = points.slice(1).map((point, index) => wall(points[index]!, point, thickness));
  if (closed) walls.push(wall(points.at(-1)!, points[0]!, thickness));
  return walls;
}

const rectangle = (x: number, y: number, width: number, height: number): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

function bounds(points: Point[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function room(elements: PlanElement[], at: Point, gapTolerance?: number) {
  const result = findRoomAt(elements, at, { gapTolerance });
  if (!result.ok) assert.fail(`expected a room, got ${result.reason}`);
  return result.polygon;
}

describe("fill room from walls", () => {
  it("takes the inner faces of a closed room", () => {
    const polygon = room(chain(rectangle(0, 0, 400, 300), 20), { x: 200, y: 150 });
    assert.equal(polygon.length, 4);
    assert.deepEqual(bounds(polygon), { minX: 10, minY: 10, maxX: 390, maxY: 290 });
    assert.equal(polygonAreaCm2(polygon), 380 * 280);
  });

  it("doesn't leak through a door or a window", () => {
    const walls = chain(rectangle(0, 0, 400, 300), 20);
    const top = walls[0]!;
    const elements: PlanElement[] = [
      ...walls,
      { id: "door", kind: "door", wallId: top.id, offset: 200, width: 90, hingeAtEnd: false, swingFlipped: false },
      { id: "window", kind: "window", wallId: walls[1]!.id, offset: 150, width: 120 },
    ];
    assert.deepEqual(bounds(room(elements, { x: 200, y: 150 })), { minX: 10, minY: 10, maxX: 390, maxY: 290 });
  });

  it("splits rooms at a T-junction", () => {
    const elements = [...chain(rectangle(0, 0, 600, 300), 20), wall({ x: 300, y: 0 }, { x: 300, y: 300 }, 10)];
    const left = room(elements, { x: 150, y: 150 });
    const right = room(elements, { x: 450, y: 150 });
    assert.deepEqual(bounds(left), { minX: 10, minY: 10, maxX: 295, maxY: 290 });
    assert.deepEqual(bounds(right), { minX: 305, minY: 10, maxX: 590, maxY: 290 });
    assert.equal(left.length, 4);
    assert.equal(polygonAreaCm2(right), 285 * 280);
  });

  it("handles a T-junction whose wall stops at the face of the other wall", () => {
    const elements = [...chain(rectangle(0, 0, 600, 300), 20), wall({ x: 300, y: 10 }, { x: 300, y: 290 }, 10)];
    assert.deepEqual(bounds(room(elements, { x: 150, y: 150 })), { minX: 10, minY: 10, maxX: 295, maxY: 290 });
  });

  it("closes a small gap within the tolerance", () => {
    // The last wall stops 12 cm short of the corner: with 10 cm walls that leaves a 2 cm gap.
    const walls = chain(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
        { x: 0, y: 12 },
      ],
      10,
      false,
    );
    assert.deepEqual(bounds(room(walls, { x: 200, y: 150 })), { minX: 5, minY: 5, maxX: 395, maxY: 295 });

    const strict = findRoomAt(walls, { x: 200, y: 150 }, { gapTolerance: 0 });
    assert.equal(strict.ok, false);
    if (!strict.ok) {
      assert.equal(strict.reason, "open");
      assert.ok(strict.gaps.some((gap) => gap.x === 0 && gap.y === 12));
    }
  });

  it("reports an area that isn't closed, with its loose ends", () => {
    const walls = chain(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
      20,
      false,
    );
    const result = findRoomAt(walls, { x: 200, y: 150 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "open");
      assert.deepEqual(
        [...result.gaps].sort((a, b) => a.y - b.y),
        [
          { x: 0, y: 0 },
          { x: 0, y: 300 },
        ],
      );
    }
  });

  it("says when the click is outside every room, on a wall, or there are no walls", () => {
    const walls = chain(rectangle(0, 0, 400, 300), 20);
    const outside = findRoomAt(walls, { x: 600, y: 150 });
    assert.deepEqual(outside, { ok: false, reason: "open", gaps: [] });
    assert.deepEqual(findRoomAt(walls, { x: 200, y: 2 }), { ok: false, reason: "on-wall", gaps: [] });
    assert.deepEqual(findRoomAt([], { x: 0, y: 0 }), { ok: false, reason: "no-walls", gaps: [] });
  });

  it("works with slanted walls", () => {
    const polygon = room(
      chain(
        [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 0, y: 300 },
        ],
        10,
      ),
      { x: 100, y: 80 },
    );
    assert.equal(polygon.length, 3);
    // The inner triangle is smaller than the one through the centre lines (60 000 cm²), but not by much.
    const area = polygonAreaCm2(polygon);
    assert.ok(area > 50_000 && area < 60_000, `area ${area}`);
  });
});
