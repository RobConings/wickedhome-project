import {
  parseFloorUnderlay,
  placeKindForFloor,
  polygonAreaM2,
  type Floor,
  type FloorUnderlay,
  type FloorInput,
  type FloorKind,
  type FloorPlan,
  type FloorPlanInput,
  type Place,
  type PlaceDetail,
  type PlaceInput,
  type PlaceKind,
  type PlacesOverview,
  type PlanElement,
  type PlanPlaceInput,
  type Point,
} from "@/features/places/types/places";
import {
  db,
  type Floor as FloorRow,
  type FloorKind as FloorKindRow,
  type Place as PlaceRow,
  type PlaceKind as PlaceKindRow,
  type PlanElement as PlanElementRow,
  type PlanElementKind as PlanElementKindRow,
  Prisma,
} from "../lib/db";
import { badRequest, conflict, notFound } from "../lib/http";

const toFloorKind = (kind: FloorKindRow) => kind.toLowerCase() as FloorKind;
const fromFloorKind = (kind: FloorKind) => kind.toUpperCase() as FloorKindRow;
const toPlaceKind = (kind: PlaceKindRow) => kind.toLowerCase() as PlaceKind;
const fromPlaceKind = (kind: PlaceKind) => kind.toUpperCase() as PlaceKindRow;

function toFloor(row: FloorRow): Floor {
  return { id: row.id, name: row.name, level: row.level, kind: toFloorKind(row.kind), gridSize: row.gridSize };
}

function toPlace(row: PlaceRow & { floor: { name: string } }): Place {
  // Stored by this service only, after zod validation, so the shape is known.
  const polygon = (row.polygon as Point[] | null) ?? null;
  return {
    id: row.id,
    name: row.name,
    kind: toPlaceKind(row.kind),
    floorId: row.floorId,
    floorName: row.floor.name,
    color: row.color,
    icon: row.icon,
    polygon,
    areaM2: polygon ? polygonAreaM2(polygon) : null,
  };
}

/** Elements store their kind in a column and everything else as JSON geometry. */
function toElement(row: PlanElementRow): PlanElement {
  return { ...(row.geometry as object), id: row.id, kind: row.kind.toLowerCase() } as PlanElement;
}

function toElementData(element: PlanElement) {
  const { id: _id, kind, ...geometry } = element;
  return { kind: kind.toUpperCase() as PlanElementKindRow, geometry };
}

const withFloorName = { floor: { select: { name: true } } } as const;
const floorOrder = [{ kind: "asc" }, { level: "asc" }, { name: "asc" }] as const satisfies Prisma.FloorOrderByWithRelationInput[];
const placeOrder = { name: "asc" } as const;

/** A nullable JSON column is cleared with `DbNull`, not `null`. */
const polygonValue = (polygon: Point[] | null | undefined) => polygon ?? Prisma.DbNull;
const underlayValue = (underlay: FloorUnderlay | null) => underlay ?? Prisma.DbNull;

/** The underlay's files must be documents of this household (not in the trash). */
async function assertOwnUnderlayFiles(householdId: string, underlay: FloorUnderlay) {
  const ids = [...new Set([underlay.sourceFileId, underlay.imageFileId])];
  const found = await db.documentFile.count({ where: { id: { in: ids }, householdId, deletedAt: null } });
  if (found !== ids.length) throw badRequest("The plan underlay refers to a document that doesn't exist");
}

// Floors ------------------------------------------------------------------------------------------------

export async function getPlacesOverview(householdId: string): Promise<PlacesOverview> {
  const [floors, places] = await Promise.all([
    db.floor.findMany({ where: { householdId }, orderBy: [...floorOrder] }),
    db.place.findMany({ where: { householdId }, include: withFloorName, orderBy: placeOrder }),
  ]);
  return { floors: floors.map(toFloor), places: places.map(toPlace) };
}

/** Loads a floor, scoped to the household so ids from other households 404. */
async function findOwnFloor(householdId: string, id: string) {
  const row = await db.floor.findFirst({ where: { id, householdId } });
  if (!row) throw notFound("Floor not found");
  return row;
}

export async function createFloor(householdId: string, input: FloorInput): Promise<Floor> {
  const row = await db.floor.create({ data: { householdId, ...input, kind: fromFloorKind(input.kind) } });
  return toFloor(row);
}

export async function updateFloor(householdId: string, id: string, input: FloorInput): Promise<Floor> {
  const floor = await findOwnFloor(householdId, id);
  const kind = fromFloorKind(input.kind);
  const row = await db.$transaction(async (tx) => {
    // Rooms become zones (and back) when a floor switches between inside and outside.
    if (floor.kind !== kind) {
      await tx.place.updateMany({ where: { floorId: id }, data: { kind: fromPlaceKind(placeKindForFloor(input.kind)) } });
    }
    return tx.floor.update({ where: { id }, data: { ...input, kind } });
  });
  return toFloor(row);
}

export async function deleteFloor(householdId: string, id: string): Promise<void> {
  await findOwnFloor(householdId, id);
  // Things will hang off places (tasks, stock), so they are never removed as a side effect.
  const placeCount = await db.place.count({ where: { floorId: id } });
  if (placeCount > 0) throw conflict("This floor still has places");
  await db.floor.delete({ where: { id } });
}

/** First run: a ground floor and the outdoor plan, with names in the user's language. */
export async function createStarterFloors(
  householdId: string,
  names: { indoor: string; outdoor: string },
): Promise<Floor[]> {
  const rows = await db.$transaction([
    db.floor.create({ data: { householdId, name: names.indoor, level: 0, kind: "INDOOR" } }),
    db.floor.create({ data: { householdId, name: names.outdoor, level: 0, kind: "OUTDOOR" } }),
  ]);
  return rows.map(toFloor);
}

// Places ------------------------------------------------------------------------------------------------

export async function listPlaces(householdId: string): Promise<Place[]> {
  const rows = await db.place.findMany({
    where: { householdId },
    include: withFloorName,
    orderBy: [{ floor: { kind: "asc" } }, { floor: { level: "asc" } }, placeOrder],
  });
  return rows.map(toPlace);
}

async function findOwnPlace(householdId: string, id: string) {
  const row = await db.place.findFirst({ where: { id, householdId }, include: withFloorName });
  if (!row) throw notFound("Place not found");
  return row;
}

export async function getPlaceDetail(householdId: string, id: string): Promise<PlaceDetail> {
  const place = await findOwnPlace(householdId, id);
  const [plan, floors] = await Promise.all([
    getFloorPlan(householdId, place.floorId),
    db.floor.findMany({ where: { householdId }, orderBy: [...floorOrder] }),
  ]);
  return { place: toPlace(place), plan, floors: floors.map(toFloor) };
}

export async function createPlace(householdId: string, input: PlaceInput): Promise<Place> {
  const floor = await findOwnFloor(householdId, input.floorId);
  const row = await db.place.create({
    data: {
      householdId,
      floorId: floor.id,
      kind: fromPlaceKind(placeKindForFloor(toFloorKind(floor.kind))),
      name: input.name,
      color: input.color.toLowerCase(),
      icon: input.icon || null,
    },
    include: withFloorName,
  });
  return toPlace(row);
}

export async function updatePlace(householdId: string, id: string, input: PlaceInput): Promise<Place> {
  const place = await findOwnPlace(householdId, id);
  const floor = await findOwnFloor(householdId, input.floorId);
  const row = await db.place.update({
    where: { id },
    data: {
      floorId: floor.id,
      kind: fromPlaceKind(placeKindForFloor(toFloorKind(floor.kind))),
      name: input.name,
      color: input.color.toLowerCase(),
      icon: input.icon || null,
      // The outline belongs to the old floor's plan.
      ...(floor.id !== place.floorId && { polygon: polygonValue(null) }),
    },
    include: withFloorName,
  });
  return toPlace(row);
}

export async function deletePlace(householdId: string, id: string): Promise<void> {
  await findOwnPlace(householdId, id);
  await db.place.delete({ where: { id } });
}

// Floor plans -------------------------------------------------------------------------------------------

export async function getFloorPlan(householdId: string, floorId: string): Promise<FloorPlan> {
  const floor = await findOwnFloor(householdId, floorId);
  const [places, elements, household] = await Promise.all([
    db.place.findMany({ where: { floorId }, include: withFloorName, orderBy: placeOrder }),
    db.planElement.findMany({ where: { floorId }, orderBy: { createdAt: "asc" } }),
    // North and the home's coordinates belong to the household: every floor shares them.
    db.household.findUnique({ where: { id: householdId }, select: { planNorthDegrees: true, latitude: true, longitude: true } }),
  ]);
  return {
    floor: toFloor(floor),
    places: places.map(toPlace),
    elements: elements.map(toElement),
    // Untyped JSON column: validated on the way out as well as on the way in.
    underlay: parseFloorUnderlay(floor.underlay),
    north: household?.planNorthDegrees ?? null,
    location:
      household?.latitude != null && household.longitude != null ? { latitude: household.latitude, longitude: household.longitude } : null,
  };
}

/**
 * Saves the editor's state in one transaction. Element ids come from the editor (doors and windows refer
 * to their wall by id), so they are checked against other floors before anything is written.
 */
export async function saveFloorPlan(householdId: string, floorId: string, input: FloorPlanInput): Promise<FloorPlan> {
  const floor = await findOwnFloor(householdId, floorId);
  const kind = fromPlaceKind(placeKindForFloor(toFloorKind(floor.kind)));

  const placeIds = input.places.flatMap((place) => (place.id ? [place.id] : []));
  const ownPlaces = await db.place.count({ where: { id: { in: placeIds }, floorId } });
  if (ownPlaces !== new Set(placeIds).size) throw notFound("Place not found on this floor");

  const elementIds = input.elements.map((element) => element.id);
  if (new Set(elementIds).size !== elementIds.length) throw badRequest("Duplicate element ids");
  const foreign = await db.planElement.count({ where: { id: { in: elementIds }, NOT: { floorId } } });
  if (foreign > 0) throw badRequest("Element ids belong to another plan");
  // Only new files are checked: a document trashed later must not block saving the walls.
  const stored = parseFloorUnderlay(floor.underlay);
  const sameFiles =
    stored && input.underlay && stored.sourceFileId === input.underlay.sourceFileId && stored.imageFileId === input.underlay.imageFileId;
  if (input.underlay && !sameFiles) await assertOwnUnderlayFiles(householdId, input.underlay);

  const placeData = (place: PlanPlaceInput) => ({
    name: place.name,
    color: place.color.toLowerCase(),
    icon: place.icon || null,
    polygon: polygonValue(place.polygon),
  });

  await db.$transaction([
    db.floor.update({
      where: { id: floorId },
      data: {
        gridSize: input.gridSize,
        // Absent: leave the underlay as it is (older clients); null removes it.
        ...(input.underlay !== undefined && { underlay: underlayValue(input.underlay) }),
      },
    }),
    // North is the household's (one for every floor); absent leaves it, null clears it.
    ...(input.north !== undefined ? [db.household.update({ where: { id: householdId }, data: { planNorthDegrees: input.north } })] : []),
    ...input.places.map((place) =>
      place.id
        ? db.place.update({ where: { id: place.id }, data: placeData(place) })
        : db.place.create({ data: { householdId, floorId, kind, ...placeData(place) } }),
    ),
    db.planElement.deleteMany({ where: { floorId, id: { notIn: elementIds } } }),
    ...input.elements.map((element) =>
      db.planElement.upsert({
        where: { id: element.id },
        create: { id: element.id, householdId, floorId, ...toElementData(element) },
        update: toElementData(element),
      }),
    ),
  ]);
  return getFloorPlan(householdId, floorId);
}
