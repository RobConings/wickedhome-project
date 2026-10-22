import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorPlanInputSchema, type FloorPlan } from "@/features/places/types/places";
import { planDiffDataSchema } from "@/features/places/types/plan-diff";
import { editGeometry, geometryEditSchema, geometryOf } from "./geometry-edit";
import { addOpening, addWalls, changedPlaces, changeOpening, docOf, overlappingRoom, planDiff, rectPoints, resizeSide } from "./plan-edit";
import { isSimplePolygon, polygonIntersectionArea } from "@/features/places/types/polygon-geometry";
import { planOverlaps } from "@/features/places/types/plan-diagnostics";
import { boundsOf } from "@/features/places/types/plan-geometry";

const rect = (x: number, y: number, width: number, depth: number) => rectPoints({ x, y, width, depth });
const recess = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 400 }, { x: 0, y: 400 }];
const plan = (): FloorPlan => ({
  floor: { id: "f1", name: "Tussenverdieping", kind: "indoor", level: 1, gridSize: 25 },
  places: [{ id: "bedroom", name: "Slaapkamer", kind: "room", floorId: "f1", floorName: "Tussenverdieping", color: "#6b8f73", icon: null, polygon: recess, areaM2: 16 }],
  elements: [],
  north: 0,
});
const wall = { id: "partition", kind: "wall" as const, a: { x: 306, y: 206 }, b: { x: 306, y: 400 }, thickness: 12 };
const door = { id: "toilet-door", kind: "door" as const, wallId: wall.id, offset: 80, width: 70, hingeAtEnd: true, swingFlipped: true };
const edit = (source: FloorPlan, input: unknown) => editGeometry(source, geometryEditSchema.parse(input));

describe("actual room contours", () => {
  it("allows a toilet in a bedroom's recess and rejects actual overlap", () => {
    assert.equal(overlappingRoom(rect(300, 200, 200, 200), [{ name: "Slaapkamer", polygon: recess }]), null);
    assert.equal(polygonIntersectionArea(recess, rect(300, 200, 200, 200)), 0);
    assert.equal(overlappingRoom(rect(250, 200, 200, 200), [{ name: "Slaapkamer", polygon: recess }]), "Slaapkamer");
    assert.equal(polygonIntersectionArea(recess, rect(250, 200, 200, 200)), 10_000);
  });

  it("integrates angled crossings, either winding, containment and shared edges", () => {
    const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const other = [{ x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    assert.equal(polygonIntersectionArea(triangle, rect(0, 0, 100, 100)), 5000);
    assert.equal(polygonIntersectionArea([...triangle].reverse(), rect(0, 0, 100, 100)), 5000);
    assert.equal(polygonIntersectionArea(triangle, other), 0);
    assert.equal(polygonIntersectionArea(triangle, rect(25, 25, 100, 100)), 1250);
    const shifted = triangle.map(({ x, y }) => ({ x: x + 25, y }));
    assert.equal(polygonIntersectionArea(triangle, shifted), 2812.5);
  });

  it("rejects self intersections, zero area and repeated corners", () => {
    assert.ok(isSimplePolygon(recess));
    assert.ok(!isSimplePolygon([...recess, recess[0]!]));
    assert.ok(!isSimplePolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]));
    assert.ok(!isSimplePolygon([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }]));
  });

  it("stops side tools from filling in recesses with bounding-box walls", () => {
    const doc = docOf(plan());
    assert.throws(() => addWalls(doc, "bedroom", ["right"], 12), /floorplan_edit_geometry/);
    assert.throws(() => addOpening(doc, "bedroom", "right", { kind: "door", widthCm: 70, thicknessCm: 12 }), /not rectangular/);
    assert.throws(() => changeOpening(doc, "bedroom", "right", "wall", 1, { remove: true }), /not rectangular/);
    assert.throws(() => resizeSide(doc, "bedroom", "right", 50), /not rectangular/);
    assert.deepEqual(doc.elements, []);
  });
});

describe("exact geometry batches", () => {
  it("creates recessed rooms, measured wall segments and openings together without snapping or extending", () => {
    const source = plan();
    const after = edit(source, { rooms: [{ name: "Toilet", polygon: rect(312, 200, 188, 200) }], elements: [wall, door] });
    assert.deepEqual(after.places[0]!.polygon, recess);
    assert.deepEqual(after.elements, [wall, door]);
    assert.deepEqual(source.elements, []);
    assert.equal(source.places.length, 1);
    assert.ok(floorPlanInputSchema.safeParse({ gridSize: 25, places: changedPlaces(docOf(source), after), elements: after.elements }).success);
    const diff = planDiff(source.floor.name, docOf(source), after);
    assert.ok(planDiffDataSchema.safeParse(diff).success);
    assert.equal(diff.rooms.find((room) => room.name === "Toilet")?.state, "added");
    assert.equal(diff.walls[0]?.thickness, 12);
    assert.equal(diff.openings[0]?.kind, "door");
  });

  it("rotates the whole submitted plan clockwise using one transform; opening offsets and swings remain exact", () => {
    const source = plan();
    const after = edit(source, { rooms: [{ id: "bedroom", name: "Slaapkamer", polygon: recess }], elements: [wall, door], transform: { rotation: 90, translation: { x: 400, y: 0 } } });
    assert.deepEqual(after.places[0]!.polygon, recess.map(({ x, y }) => ({ x: 400 - y, y: x })));
    assert.deepEqual(after.elements[0], { ...wall, a: { x: 194, y: 306 }, b: { x: 0, y: 306 } });
    assert.deepEqual(after.elements[1], door);
    assert.equal(after.north, 0);
  });

  it("checks the final room arrangement so adjacent rooms can be moved together", () => {
    const source = plan();
    source.places[0]!.polygon = rect(0, 0, 200, 200);
    source.places.push({ ...source.places[0]!, id: "toilet", name: "Toilet", polygon: rect(200, 0, 200, 200) });
    const after = edit(source, { rooms: [{ name: "Slaapkamer", polygon: rect(200, 0, 200, 200) }, { name: "Toilet", polygon: rect(400, 0, 200, 200) }] });
    assert.equal(after.places.length, 2);
    assert.equal(after.places[0]!.id, "bedroom");
  });

  it("upserts by id and removes a wall together with its openings", () => {
    const source = plan();
    source.elements = [wall, door];
    const after = edit(source, { elements: [{ ...wall, thickness: 14 }], allowOverlaps: true });
    assert.deepEqual(after.elements, [door, { ...wall, thickness: 14 }]);
    assert.deepEqual(edit(source, { removeElementIds: [wall.id] }).elements, []);
    assert.deepEqual(source.elements, [wall, door]);
  });

  it("explicit replacement clears omitted outlines and elements, retaining existing room identities and metadata", () => {
    const source = plan();
    source.elements = [wall, door];
    const after = edit(source, { replaceDrawing: true, rooms: [{ name: "Toilet", polygon: rect(0, 0, 100, 200) }] });
    assert.equal(after.places[0]!.id, "bedroom");
    assert.equal(after.places[0]!.color, source.places[0]!.color);
    assert.equal(after.places[0]!.polygon, null);
    assert.deepEqual(after.elements, []);
    assert.equal(changedPlaces(docOf(source), after).length, 2);
    assert.equal(planDiff(source.floor.name, docOf(source), after).rooms[0]?.state, "removed");
  });

  it("rejects dangling wallIds, zero length walls, duplicate ids and invalid geometry without changing the source", () => {
    const source = plan();
    assert.throws(() => edit(source, { elements: [door] }), /must sit in a wall/);
    assert.throws(() => edit(source, { elements: [{ ...wall, b: wall.a }] }), /distinct endpoints/);
    assert.throws(() => edit(source, { elements: [wall, wall] }), /Duplicate element id/);
    assert.throws(() => edit(source, { rooms: [{ name: "Toilet", polygon: rect(0, 0, 200, 200) }] }), /overlap/);
    assert.throws(() => edit(source, { rooms: [{ id: "foreign", name: "Toilet", polygon: null }] }), /not on this floor/);
    assert.throws(() => edit(source, { rooms: [{ name: "Toilet", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }] }), /simple polygon/);
    assert.throws(() => edit(source, { rooms: [{ name: "Slaapkamer", polygon: recess }], transform: { translation: { x: 100_000, y: 0 } } }), /100000/);
    assert.deepEqual(source, plan());
  });

  it("rejects openings outside a segment instead of silently clamping the architect's measurements", () => {
    assert.throws(() => edit(plan(), { elements: [wall, { ...door, offset: 20 }] }), /does not fit/);
    assert.throws(() => edit(plan(), { elements: [wall, { ...door, offset: 190 }] }), /does not fit/);
    const source = plan();
    source.elements = [wall, door];
    assert.throws(() => edit(source, { elements: [{ ...wall, b: { x: 300, y: 250 } }] }), /does not fit/);
  });

  it("returns all exact contours and element ids for verification", () => {
    const source = plan();
    source.elements = [wall, door];
    const geometry = geometryOf(source);
    assert.deepEqual(geometry.rooms[0]!.polygon, recess);
    assert.equal(geometry.rooms[0]!.id, "bedroom");
    assert.deepEqual(geometry.elements, [wall, door]);
    assert.match(geometry.coordinates, /centre/);
  });

  it("reports room overlaps and explicitly allows keeping them", () => {
    const source = plan();
    const rooms = [{ name: "Toilet", polygon: rect(0, 0, 100, 100) }];
    assert.throws(() => edit(source, { rooms }), /allowOverlaps: true/);
    const after = edit(source, { rooms, allowOverlaps: true });
    const warnings = planOverlaps(after.places, after.elements);
    assert.equal(warnings[0]?.kind, "room_overlap");
    assert.equal(warnings[0]?.amount, 10_000);
    // Even small overlaps are reported, instead of hiding them behind a bounding-box tolerance.
    assert.equal(planOverlaps([{ name: "A", polygon: rect(0, 0, 100, 100) }, { name: "B", polygon: rect(99, 0, 100, 100) }], [])[0]?.amount, 100);
  });

  it("lets existing overlaps remain during repairs and flags enlarged overlaps", () => {
    const source = plan();
    source.places.push({ ...source.places[0]!, id: "toilet", name: "Toilet", polygon: rect(0, 0, 100, 100) });
    assert.doesNotThrow(() => edit(source, { elements: [wall] }));
    assert.doesNotThrow(() => edit(source, { rooms: [{ name: "Toilet", polygon: rect(0, 0, 50, 100) }] }));
    assert.throws(() => edit(source, { rooms: [{ name: "Toilet", polygon: rect(0, 0, 200, 100) }] }), /overlap/);
  });

  it("reports duplicate/overlapping wall spans and interior crossings, with an explicit keep option", () => {
    const duplicate = { ...wall, id: "duplicate" };
    assert.throws(() => edit(plan(), { elements: [wall, duplicate] }), /Walls partition and duplicate/);
    const after = edit(plan(), { elements: [wall, duplicate], allowOverlaps: true });
    assert.equal(planOverlaps([], after.elements)[0]?.kind, "wall_overlap");
    const cross = { ...wall, id: "cross", a: { x: 200, y: 300 }, b: { x: 400, y: 300 } };
    assert.equal(planOverlaps([], [wall, cross])[0]?.kind, "wall_overlap");
    assert.equal(geometryOf({ ...plan(), elements: [wall, duplicate] }).warnings.length, 1);
  });

  it("does not call normal corners, T-junctions, face-touching parallel walls or room boundaries overlaps", () => {
    const corner = { ...wall, id: "corner", a: wall.b, b: { x: 500, y: 400 } };
    const tee = { ...wall, id: "tee", a: { x: 306, y: 300 }, b: { x: 500, y: 300 } };
    const beside = { ...wall, id: "beside", a: { x: 318, y: 200 }, b: { x: 318, y: 400 } };
    assert.deepEqual(planOverlaps([], [wall, corner, tee]), []);
    assert.deepEqual(planOverlaps([], [wall, beside]), []);
    assert.deepEqual(planOverlaps([{ name: "A", polygon: rect(0, 0, 100, 100) }, { name: "B", polygon: rect(100, 0, 100, 100) }], []), []);
  });

  it("reports walls intruding into room outlines and allows an intentional interior partition", () => {
    const intrusive = { ...wall, a: { x: 250, y: 200 }, b: { x: 250, y: 400 } };
    assert.throws(() => edit(plan(), { elements: [intrusive] }), /intrudes into/);
    const after = edit(plan(), { elements: [intrusive], allowOverlaps: true });
    assert.equal(planOverlaps(after.places, after.elements)[0]?.kind, "room_wall_overlap");
    assert.deepEqual(planOverlaps(plan().places, [wall]), []);
  });

  it("fills adjoining rooms from one shared wall and keeps doors/windows attached during a coordinated repair", () => {
    const corners = rect(0, 0, 400, 400);
    const outer = corners.map((a, index) => ({ id: `outer-${index}`, kind: "wall" as const, a, b: corners[(index + 1) % corners.length]!, thickness: 20 }));
    const shared = { ...wall, a: { x: 200, y: 0 }, b: { x: 200, y: 400 } };
    const window = { id: "shared-window", kind: "window" as const, wallId: shared.id, offset: 300, width: 80 };
    const elements = [...outer, shared, door, window];
    const rooms = [{ name: "Left", inside: { x: 100, y: 100 } }, { name: "Right", inside: { x: 300, y: 100 } }];
    const source = plan();
    const after = edit(source, { replaceDrawing: true, rooms, elements });
    const left = after.places.find((place) => place.name === "Left")!;
    const right = after.places.find((place) => place.name === "Right")!;
    assert.deepEqual(boundsOf(left.polygon!), { minX: 10, minY: 10, maxX: 194, maxY: 390 });
    assert.deepEqual(boundsOf(right.polygon!), { minX: 206, minY: 10, maxX: 390, maxY: 390 });
    assert.deepEqual(planOverlaps(after.places, after.elements), []);
    const saved: FloorPlan = { ...source, places: [
      { ...source.places[0]!, id: "left", name: "Left", polygon: left.polygon },
      { ...source.places[0]!, id: "right", name: "Right", polygon: right.polygon },
    ], elements: after.elements };
    const repaired = edit(saved, { rooms, elements: [{ ...shared, a: { x: 250, y: 0 }, b: { x: 250, y: 400 } }] });
    assert.equal(boundsOf(repaired.places[0]!.polygon!)!.maxX, 244);
    assert.equal(boundsOf(repaired.places[1]!.polygon!)!.minX, 256);
    assert.deepEqual(repaired.elements.find((element) => element.id === door.id), door);
    assert.deepEqual(repaired.elements.find((element) => element.id === window.id), window);
    assert.deepEqual(planOverlaps(repaired.places, repaired.elements), []);
  });

  it("reports open wall networks and invalid interior seeds instead of inventing room boundaries", () => {
    assert.throws(() => edit(plan(), { rooms: [{ name: "Room", inside: { x: 100, y: 100 } }] }), /no-walls/);
    assert.throws(() => edit(plan(), { rooms: [{ name: "Room", inside: { x: 100, y: 100 } }], elements: [wall] }), /open/);
    assert.throws(() => edit(plan(), { rooms: [{ name: "Room", inside: wall.a }], elements: [wall] }), /on-wall/);
    assert.throws(() => edit(plan(), { rooms: [{ name: "Room", polygon: null, inside: { x: 100, y: 100 } }] }), /polygon OR inside/);
    assert.throws(() => edit(plan(), { rooms: [{ name: "Room" }] }), /polygon OR inside/);
  });
});
