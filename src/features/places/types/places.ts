import { z } from "zod";
import { hexColorSchema, idSchema } from "@/types/common";

export const FLOOR_KINDS = ["indoor", "outdoor"] as const;
export const floorKindSchema = z.enum(FLOOR_KINDS);
export type FloorKind = z.infer<typeof floorKindSchema>;

export const PLACE_KINDS = ["room", "zone"] as const;
export const placeKindSchema = z.enum(PLACE_KINDS);
export type PlaceKind = z.infer<typeof placeKindSchema>;

/** Grid spacings offered in the editor, in centimetres. 5 cm helps when tracing over an imported plan. */
export const GRID_SIZES = [5, 10, 25, 50, 100] as const;
export const DEFAULT_GRID_SIZE = 25;

// Geometry ---------------------------------------------------------------------------------------------
// Plans use centimetres on a flat plane: x to the right, y down (like the screen), whole numbers only.

const coordinateSchema = z.number().int().min(-100_000).max(100_000);
export const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema });
export type Point = z.infer<typeof pointSchema>;

export const polygonSchema = z.array(pointSchema).min(3).max(200);

export const floorInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.coerce.number().int().min(-10).max(50),
  kind: floorKindSchema,
});
export type FloorInput = z.infer<typeof floorInputSchema>;

export const placeInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  floorId: idSchema,
  color: hexColorSchema,
  icon: z.string().trim().max(8).optional().nullable(),
});
export type PlaceInput = z.infer<typeof placeInputSchema>;

const wallSchema = z.object({
  id: idSchema,
  kind: z.literal("wall"),
  a: pointSchema,
  b: pointSchema,
  /** Wall thickness in cm. */
  thickness: z.number().int().min(2).max(100),
});

const openingFields = {
  id: idSchema,
  /** The wall this opening sits in; it moves with the wall. */
  wallId: idSchema,
  /** Distance in cm from the wall's start point (`a`) to the centre of the opening. */
  offset: z.number().int().min(0).max(200_000),
  /** Opening width in cm. */
  width: z.number().int().min(20).max(1000),
};

const doorSchema = z.object({
  ...openingFields,
  kind: z.literal("door"),
  /** Hinge at the wall's end side (`b`) instead of its start side. */
  hingeAtEnd: z.boolean(),
  /** Swing to the other side of the wall. */
  swingFlipped: z.boolean(),
});

const windowSchema = z.object({ ...openingFields, kind: z.literal("window") });

export const planElementSchema = z.discriminatedUnion("kind", [wallSchema, doorSchema, windowSchema]);
export type PlanElement = z.infer<typeof planElementSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Door = z.infer<typeof doorSchema>;
export type Window = z.infer<typeof windowSchema>;
export type Opening = Door | Window;
export type PlanElementKind = PlanElement["kind"];

/** A place as the editor saves it: existing places by id, places drawn in the editor without one. */
export const planPlaceInputSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(60),
  color: hexColorSchema,
  icon: z.string().trim().max(8).optional().nullable(),
  polygon: polygonSchema.nullable(),
});
export type PlanPlaceInput = z.infer<typeof planPlaceInputSchema>;

// Underlay: an imported architect's plan under the drawing ---------------------------------------------
// The original file (PDF, PNG or JPG) and the rendered crop (PNG) live in the documents feature, linked to
// the floor. "Underlay units" are PDF points (pdf.js viewport at scale 1, y down, page rotation applied)
// for a PDF and pixels for an image. The plan itself always stays in centimetres: calibrating changes the
// underlay's scale, never the drawing.

export const UNDERLAY_UNITS = ["pt", "px"] as const;

const finite = z.number().finite();

/** A rectangle in underlay units. */
export const underlayRectSchema = z.object({
  x: finite.min(0).max(1_000_000),
  y: finite.min(0).max(1_000_000),
  width: finite.positive().max(1_000_000),
  height: finite.positive().max(1_000_000),
});
export type UnderlayRect = z.infer<typeof underlayRectSchema>;

/** A room label read from the PDF ("Keuken 12,65 m2"), at `u`/`v` relative to the crop's top-left. */
export const underlayLabelSchema = z.object({
  /** Empty when only an area was found. */
  name: z.string().trim().max(60),
  areaM2: z.number().min(0).max(100_000).nullable(),
  u: finite.min(-1_000_000).max(1_000_000),
  v: finite.min(-1_000_000).max(1_000_000),
});
export type UnderlayLabel = z.infer<typeof underlayLabelSchema>;

export const floorUnderlaySchema = z.object({
  /** The imported file in Documents (kept so the crop can be redone). */
  sourceFileId: idSchema,
  /** The image shown: the rendered crop, or the source itself for an uncropped image. */
  imageFileId: idSchema,
  sourceName: z.string().trim().min(1).max(200),
  /** `application/pdf`, `image/png` or `image/jpeg`. */
  sourceMimeType: z.string().max(127),
  unit: z.enum(UNDERLAY_UNITS),
  /** PDF page, from 1 (always 1 for an image). */
  page: z.number().int().min(1).max(10_000),
  /** The part of the page (or image) that was cropped, in underlay units. */
  crop: underlayRectSchema,
  /** Centimetres per underlay unit. */
  scale: finite.positive().max(10_000),
  /** False until the user calibrated it (two points or the drawing scale). */
  calibrated: z.boolean(),
  /** Degrees clockwise on screen, around the crop's centre. */
  rotation: finite.min(-360).max(360),
  /** Where the crop's centre sits on the plan, in cm. */
  center: z.object({ x: finite.min(-200_000).max(200_000), y: finite.min(-200_000).max(200_000) }),
  opacity: finite.min(0.05).max(1),
  visible: z.boolean(),
  /** Locked: clicks go through to the plan; unlocked: drag it with the select tool. */
  locked: z.boolean(),
  labels: z.array(underlayLabelSchema).max(300),
});
export type FloorUnderlay = z.infer<typeof floorUnderlaySchema>;

/** The stored column is untyped JSON: anything that doesn't match the schema reads as no underlay. */
export function parseFloorUnderlay(value: unknown): FloorUnderlay | null {
  if (value === null || value === undefined) return null;
  const result = floorUnderlaySchema.safeParse(value);
  return result.success ? result.data : null;
}

// Orientation ------------------------------------------------------------------------------------------
// The house has one true north, stored on the household and shared by every floor (they share the plan's
// coordinates): degrees clockwise from the plan's "up", 0 = north is up, 90 = north points right.

export const northDegreesSchema = finite.min(0).lt(360);

/**
 * Saving a floor plan. Elements replace the floor's elements; places are updated or created, and places
 * of the floor that are not listed stay as they are. `underlay`: an object replaces it, null removes it,
 * absent leaves it as it is. `north` (the household's, see Orientation) works the same way.
 */
export const floorPlanInputSchema = z
  .object({
    gridSize: z.union(GRID_SIZES.map((size) => z.literal(size))),
    places: z.array(planPlaceInputSchema).max(300),
    elements: z.array(planElementSchema).max(2000),
    underlay: floorUnderlaySchema.nullable().optional(),
    north: northDegreesSchema.nullable().optional(),
  })
  .refine(
    (plan) => {
      const walls = new Set(plan.elements.filter((element) => element.kind === "wall").map((wall) => wall.id));
      return plan.elements.every((element) => element.kind === "wall" || walls.has(element.wallId));
    },
    { message: "Every door and window must sit in a wall of this plan", path: ["elements"] },
  );
export type FloorPlanInput = z.infer<typeof floorPlanInputSchema>;

// Read models ------------------------------------------------------------------------------------------

export type Floor = {
  id: string;
  name: string;
  /** Ordering: 0 = ground floor, 1 = first floor, -1 = basement. */
  level: number;
  kind: FloorKind;
  /** Editor grid spacing in cm. */
  gridSize: number;
};

export type Place = {
  id: string;
  name: string;
  /** `room` on an indoor floor, `zone` on the outdoor plan; inside/outside follows from it. */
  kind: PlaceKind;
  floorId: string;
  floorName: string;
  color: string;
  icon: string | null;
  /** Outline on the floor plan in cm, or null when it has not been drawn. */
  polygon: Point[] | null;
  /** Area of the outline in m², or null without one. */
  areaM2: number | null;
};

export type PlacesOverview = {
  floors: Floor[];
  places: Place[];
};

export type FloorPlan = {
  floor: Floor;
  places: Place[];
  elements: PlanElement[];
  /** The imported plan under the drawing. Always set by the API; optional for older callers. */
  underlay?: FloorUnderlay | null;
  /** Where true north is on the plan (the household's, shared by every floor), or null when not set. */
  north?: number | null;
  /** The home's coordinates (WGS84), for the sun's position; null without an address. */
  location?: { latitude: number; longitude: number } | null;
};

export type PlaceDetail = {
  place: Place;
  /** The floor the place is on, to show it in context. */
  plan: FloorPlan;
  /** Every floor of the household, to move the place to another one. */
  floors: Floor[];
};

// Helpers shared by the API and the UI -------------------------------------------------------------------

/** A room is inside, a zone is outside. */
export const isOutside = (place: Pick<Place, "kind">) => place.kind === "zone";

export const placeKindForFloor = (kind: FloorKind): PlaceKind => (kind === "outdoor" ? "zone" : "room");

/** Group key of the things without a place in a list grouped per place (`GeneralList` `groupBy`). */
export const NO_PLACE_GROUP = "no-place";

/** Group key of a thing's place in a list grouped per place; things without one share `NO_PLACE_GROUP`. */
export const placeGroupKey = (place: Pick<Place, "id"> | null | undefined) => place?.id ?? NO_PLACE_GROUP;

/**
 * Group order of a list grouped per place (`GeneralList` `groupOrder`): by floor, then by name, and the
 * things without a place last. Duplicates and nulls are fine, so pass every item's place.
 */
export function placeGroupOrder(places: Iterable<Pick<Place, "id" | "name" | "floorName"> | null | undefined>): string[] {
  const unique = new Map<string, Pick<Place, "id" | "name" | "floorName">>();
  for (const place of places) if (place) unique.set(place.id, place);
  const sorted = [...unique.values()].sort(
    (a, b) => a.floorName.localeCompare(b.floorName) || a.name.localeCompare(b.name),
  );
  return [...sorted.map((place) => place.id), NO_PLACE_GROUP];
}

/** Area of a polygon in cm² (shoelace formula); the winding direction does not matter. */
export function polygonAreaCm2(points: readonly Point[]): number {
  let twice = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    twice += point.x * next.y - next.x * point.y;
  });
  return Math.abs(twice) / 2;
}

/** Area of a polygon in m², rounded to two decimals. */
export const polygonAreaM2 = (points: readonly Point[]) => Math.round(polygonAreaCm2(points) / 100) / 100;

/** Palette offered for places. Readable as a soft fill on the plan and as a dot in lists, light and dark. */
export const PLACE_COLORS = [
  "#6b8f73",
  "#3b82b6",
  "#7c5cc4",
  "#c2508a",
  "#d4573b",
  "#d9912b",
  "#c9a227",
  "#7d9a3c",
  "#2f9e8f",
  "#6b7280",
] as const;

/** Adults and owners manage places and plans; children can only look. Mirrors the API's role check. */
export const canManagePlaces = (role: "owner" | "adult" | "child") => role !== "child";
