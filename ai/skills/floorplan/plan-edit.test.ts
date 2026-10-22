/**
 * The floor-plan drawing maths (no database): relative placement → shapes, north, resizing with walls,
 * doors and windows on a side, the text summary and the preview diff.
 *
 *   DATABASE_URL=postgresql://test@localhost/test npx tsx --test ai/skills/floorplan/plan-edit.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorPlanInputSchema, polygonAreaM2, type FloorPlan, type PlanElement, type Point } from "@/features/places/types/places";
import { planDiffDataSchema } from "@/features/places/types/plan-diff";
import {
  addOpening,
  addWalls,
  changedPlaces,
  changeOpening,
  compassOf,
  docOf,
  isRectangle,
  moveRoom,
  neighbours,
  overlappingRoom,
  placeBeside,
  planDiff,
  planSummary,
  PlanEditError,
  rectPoints,
  resizeSide,
  screenDirection,
  sizeText,
  wallsOnSide,
  type EditDoc,
} from "./plan-edit";

const rect = (x: number, y: number, width: number, depth: number): Point[] => rectPoints({ x, y, width, depth });

/** A living (6 × 4,5 m) with walls on all four sides and a kitchen east of it. */
function plan(north: number | null = null): FloorPlan {
  const walls: PlanElement[] = [
    { id: "w-top", kind: "wall", a: { x: -7, y: -7 }, b: { x: 607, y: -7 }, thickness: 14 },
    { id: "w-right", kind: "wall", a: { x: 607, y: -7 }, b: { x: 607, y: 457 }, thickness: 14 },
    { id: "w-bottom", kind: "wall", a: { x: 607, y: 457 }, b: { x: -7, y: 457 }, thickness: 14 },
    { id: "w-left", kind: "wall", a: { x: -7, y: 457 }, b: { x: -7, y: -7 }, thickness: 14 },
    { id: "d-1", kind: "door", wallId: "w-bottom", offset: 100, width: 90, hingeAtEnd: false, swingFlipped: false },
  ];
  const place = (id: string, name: string, polygon: Point[] | null) => ({
    id,
    name,
    kind: "room" as const,
    floorId: "f1",
    floorName: "Gelijkvloers",
    color: "#6b8f73",
    icon: null,
    polygon,
    areaM2: polygon ? polygonAreaM2(polygon) : null,
  });
  return {
    floor: { id: "f1", name: "Gelijkvloers", level: 0, kind: "indoor", gridSize: 25 },
    places: [place("p-living", "Living", rect(0, 0, 600, 450)), place("p-kitchen", "Keuken", rect(614, 0, 400, 450)), place("p-attic", "Zolder", null)],
    elements: walls,
    north,
  };
}

describe("directions", () => {
  it("maps compass sides through the plan's north, screen sides as drawn", () => {
    assert.equal(screenDirection("east", null), "right");
    assert.equal(screenDirection("north", 0), "up");
    // North points right on the drawing: east is down, west is up.
    assert.equal(screenDirection("north", 90), "right");
    assert.equal(screenDirection("east", 90), "down");
    assert.equal(screenDirection("west", 90), "up");
    // Not a multiple of 90: the nearest axis.
    assert.equal(screenDirection("north", 30), "up");
    assert.equal(screenDirection("north", 50), "right");
    assert.equal(screenDirection("left", 90), "left");
    assert.equal(compassOf("right", 90), "north");
    assert.equal(compassOf("down", null), "south");
  });
});

describe("placing a rectangle next to a room", () => {
  const living = { minX: 0, minY: 0, maxX: 600, maxY: 450 };
  it("puts it flush against the side, aligned to the start by default", () => {
    assert.deepEqual(placeBeside(living, { width: 300, depth: 280 }, "right"), { x: 600, y: 0, width: 300, depth: 280 });
    assert.deepEqual(placeBeside(living, { width: 300, depth: 280 }, "left"), { x: -300, y: 0, width: 300, depth: 280 });
    assert.deepEqual(placeBeside(living, { width: 300, depth: 280 }, "up"), { x: 0, y: -280, width: 300, depth: 280 });
    assert.deepEqual(placeBeside(living, { width: 300, depth: 280 }, "down", "end"), { x: 300, y: 450, width: 300, depth: 280 });
    assert.deepEqual(placeBeside(living, { width: 300, depth: 250 }, "right", "center", 14), { x: 614, y: 100, width: 300, depth: 250 });
  });

  it("knows rectangles, overlaps and Belgian sizes", () => {
    assert.ok(isRectangle(rect(0, 0, 10, 10)));
    assert.ok(!isRectangle([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }]));
    assert.equal(overlappingRoom(rect(500, 0, 300, 280), [{ name: "Living", polygon: rect(0, 0, 600, 450) }]), "Living");
    assert.equal(overlappingRoom(rect(600, 0, 300, 280), [{ name: "Living", polygon: rect(0, 0, 600, 450) }]), null);
    assert.equal(sizeText(320, 280), "3,2 × 2,8 m");
    assert.equal(sizeText(285, 400), "2,85 × 4 m");
  });
});

describe("editing rooms", () => {
  it("moves a room with the walls around it (and their doors), but not a wall it shares", () => {
    const before = docOf(plan());
    const after = moveRoom(before, "p-living", 0, 100);
    assert.deepEqual(after.places[0]!.polygon, rect(0, 100, 600, 450));
    const top = after.elements.find((element) => element.id === "w-top");
    assert.equal(top?.kind === "wall" && top.a.y, 93);
    // The kitchen is untouched, and so is the wall between them.
    assert.deepEqual(after.places[1]!.polygon, before.places[1]!.polygon);
    assert.deepEqual(after.elements.find((element) => element.id === "w-right"), before.elements.find((element) => element.id === "w-right"));
  });

  it("resizes one side; the walls on it follow and the joining walls stretch", () => {
    const after = resizeSide(docOf(plan()), "p-living", "down", 50);
    assert.deepEqual(after.places[0]!.polygon, rect(0, 0, 600, 500));
    const bottom = after.elements.find((element) => element.id === "w-bottom");
    const left = after.elements.find((element) => element.id === "w-left");
    assert.equal(bottom?.kind === "wall" && bottom.a.y, 507);
    assert.deepEqual(left?.kind === "wall" && [left.a.y, left.b.y], [507, -7]);
    // The wall shared with the kitchen stretches along too.
    const right = after.elements.find((element) => element.id === "w-right");
    assert.equal(right?.kind === "wall" && right.b.y, 507);
    assert.throws(() => resizeSide(docOf(plan()), "p-living", "right", -580), PlanEditError);
  });

  it("refuses rooms that are not drawn", () => {
    assert.throws(() => moveRoom(docOf(plan()), "p-attic", 10, 10), /not drawn/);
  });

  it("lists only the rooms that changed, new ones without an id", () => {
    const before = docOf(plan());
    const after: EditDoc = { ...before, places: [...before.places, { key: "new", name: "Bureau", color: "#3b82b6", icon: null, polygon: rect(600, 0, 300, 280) }] };
    assert.deepEqual(changedPlaces(before, after), [{ name: "Bureau", color: "#3b82b6", icon: null, polygon: rect(600, 0, 300, 280) }]);
  });
});

describe("doors, windows and walls", () => {
  it("puts a door into the existing wall of a side, centred, opening into the room", () => {
    const after = addOpening(docOf(plan()), "p-living", "up", { kind: "door", widthCm: 90, thicknessCm: 14 });
    const door = after.elements.at(-1);
    assert.equal(door?.kind, "door");
    assert.equal(door?.kind === "door" && door.wallId, "w-top");
    assert.equal(door?.kind === "door" && door.offset, 307);
    // Same number of walls: it used the one that was there.
    assert.equal(after.elements.filter((element) => element.kind === "wall").length, 4);
    assert.ok(floorPlanInputSchema.safeParse({ gridSize: 25, places: [], elements: after.elements }).success);
  });

  it("draws a wall first when the side has none, and measures offsets from the side's start", () => {
    const after = addOpening(docOf(plan()), "p-kitchen", "right", { kind: "window", widthCm: 120, offsetCm: 50, thicknessCm: 14 });
    const wall = after.elements.at(-2);
    const window = after.elements.at(-1);
    assert.equal(wall?.kind === "wall" && wall.a.x, 1021);
    // Near edge 50 cm from the top: centre at 50 + 60 = 110 from the top of the kitchen (y 0), wall starts at y −7.
    assert.equal(window?.kind === "window" && window.offset, 117);
    assert.throws(() => addOpening(docOf(plan()), "p-kitchen", "right", { kind: "window", widthCm: 500, thicknessCm: 14 }), /only 4,5 m/);
  });

  it("adds walls only where a side has none", () => {
    const { added } = addWalls(docOf(plan()), "p-living", ["up", "right", "down", "left"], 14);
    assert.equal(added, 0);
    const kitchen = addWalls(docOf(plan()), "p-kitchen", ["up", "right", "down", "left"], 14);
    // The kitchen's west side shares the living's east wall (a wall's thickness apart).
    assert.equal(kitchen.added, 3);
    assert.equal(wallsOnSide(kitchen.doc.elements, { minX: 614, minY: 0, maxX: 1014, maxY: 450 }, "left")[0]?.id, "w-right");
  });

  it("moves, flips and removes the n-th opening on a side", () => {
    const moved = changeOpening(docOf(plan()), "p-living", "down", "door", 1, { offsetCm: 0, flip: "swing" });
    const door = moved.elements.find((element) => element.id === "d-1");
    assert.equal(door?.kind === "door" && door.swingFlipped, true);
    // The bottom wall runs right to left (607 → −7): the near edge at x 0 puts the centre at x 45, 562 from a.
    assert.equal(door?.kind === "door" && door.offset, 562);
    const removed = changeOpening(docOf(plan()), "p-living", "down", "door", 1, { remove: true });
    assert.equal(removed.elements.some((element) => element.id === "d-1"), false);
    assert.throws(() => changeOpening(docOf(plan()), "p-living", "down", "door", 2, {}), /no door 2/);
    const wallGone = changeOpening(docOf(plan()), "p-living", "down", "wall", 1, { remove: true });
    // Removing the wall removes its door too.
    assert.equal(wallGone.elements.some((element) => element.id === "d-1"), false);
  });
});

describe("reading the plan", () => {
  it("names neighbours by compass side and summarises the floor as text", () => {
    assert.deepEqual(neighbours(docOf(plan()), "p-living"), ["east Keuken"]);
    assert.deepEqual(neighbours(docOf(plan(90)), "p-living"), ["north Keuken"]);
    const text = planSummary(plan());
    assert.match(text, /Living 6 × 4,5 m, 27 m², x 0–600 y 0–450; next to: east Keuken; south: 1 door/);
    assert.match(text, /Not drawn: Zolder/);
    assert.match(text, /Walls 4, doors 1, windows 0/);
  });

  it("builds a small, valid preview with what changed", () => {
    const before = docOf(plan());
    const after = addOpening(moveRoom(before, "p-kitchen", 0, 50), "p-kitchen", "right", { kind: "door", widthCm: 90, thicknessCm: 14 });
    const diff = planDiff("Gelijkvloers", before, after);
    assert.ok(planDiffDataSchema.safeParse(diff).success);
    assert.deepEqual(diff.rooms.map((room) => [room.name, room.state]), [["Living", "same"], ["Keuken", "changed"]]);
    assert.ok(diff.rooms[1]!.before);
    assert.equal(diff.walls.filter((wall) => wall.state === "added").length, 1);
    assert.deepEqual(diff.openings.map((opening) => opening.state).sort(), ["added", "same"]);
    assert.ok(JSON.stringify(diff).length < 2000);
  });
});
