import { AppWindowIcon, ShieldIcon, ThermometerIcon, WashingMachineIcon } from "lucide-react";
import type { PlanLegendItem, PlanMarker, PlanMarkerPaletteEntry } from "@/features/places";
import {
  polygonAreaM2,
  type Floor,
  type FloorPlan,
  type Place,
  type PlaceDetail,
  type PlacesOverview,
  type PlanElement,
  type Point,
} from "@/features/places/types/places";

/** Example data for stories: a 10 × 8 m ground floor, an empty first floor and the garden. */

export const floorFixtures = {
  ground: { id: "f-ground", name: "Ground floor", level: 0, kind: "indoor", gridSize: 25 },
  first: { id: "f-first", name: "First floor", level: 1, kind: "indoor", gridSize: 25 },
  outside: { id: "f-outside", name: "Outside", level: 0, kind: "outdoor", gridSize: 50 },
} satisfies Record<string, Floor>;

const rect = (x: number, y: number, width: number, height: number): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

/** A regular polygon, for round things like the jacuzzi. */
const circle = (cx: number, cy: number, r: number, sides = 10): Point[] =>
  Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: Math.round(cx + Math.cos(angle) * r), y: Math.round(cy + Math.sin(angle) * r) };
  });

function place(id: string, floor: Floor, name: string, color: string, polygon: Point[] | null, icon: string | null = null): Place {
  return {
    id,
    name,
    kind: floor.kind === "outdoor" ? "zone" : "room",
    floorId: floor.id,
    floorName: floor.name,
    color,
    icon,
    polygon,
    areaM2: polygon ? polygonAreaM2(polygon) : null,
  };
}

const { ground, first, outside } = floorFixtures;

export const placeFixtures = {
  living: place("p-living", ground, "Living room", "#6b8f73", rect(0, 0, 600, 450), "🛋️"),
  kitchen: place("p-kitchen", ground, "Kitchen", "#d9912b", rect(600, 0, 400, 450), "🍳"),
  hall: place("p-hall", ground, "Hall", "#6b7280", rect(0, 450, 350, 350)),
  toilet: place("p-toilet", ground, "Toilet", "#3b82b6", rect(350, 450, 150, 350)),
  office: place("p-office", ground, "Office", "#7c5cc4", [
    { x: 500, y: 450 },
    { x: 1000, y: 450 },
    { x: 1000, y: 800 },
    { x: 700, y: 800 },
    { x: 700, y: 650 },
    { x: 500, y: 650 },
  ], "💻"),
  storage: place("p-storage", ground, "Storage", "#c9a227", rect(500, 650, 200, 150)),
  laundry: place("p-laundry", ground, "Laundry", "#2f9e8f", null, "🧺"),
  bedroom: place("p-bedroom", first, "Bedroom", "#c2508a", null, "🛏️"),
  bathroom: place("p-bathroom", first, "Bathroom", "#3b82b6", null, "🛁"),
  garden: place("p-garden", outside, "Garden", "#7d9a3c", rect(0, 0, 1800, 1200), "🌳"),
  terrace: place("p-terrace", outside, "Terrace", "#d4573b", rect(0, 1200, 1000, 300)),
  driveway: place("p-driveway", outside, "Driveway", "#6b7280", rect(1000, 1200, 400, 800), "🚗"),
  shed: place("p-shed", outside, "Shed", "#c9a227", rect(1450, 100, 300, 300), "🛖"),
  jacuzzi: place("p-jacuzzi", outside, "Jacuzzi", "#3b82b6", circle(400, 400, 110), "🛁"),
  vegetables: place("p-vegetables", outside, "Vegetable garden", "#2f9e8f", rect(1100, 700, 600, 400), "🥕"),
  frontYard: place("p-front", outside, "Front yard", "#6b8f73", null),
} satisfies Record<string, Place>;

const wall = (id: string, a: Point, b: Point, thickness: number): PlanElement => ({ id, kind: "wall", a, b, thickness });

const groundElements: PlanElement[] = [
  // Outside walls, clockwise from the top-left corner.
  wall("w-top", { x: 0, y: 0 }, { x: 1000, y: 0 }, 30),
  wall("w-right", { x: 1000, y: 0 }, { x: 1000, y: 800 }, 30),
  wall("w-bottom", { x: 1000, y: 800 }, { x: 0, y: 800 }, 30),
  wall("w-left", { x: 0, y: 800 }, { x: 0, y: 0 }, 30),
  // Inside walls.
  wall("w-living-kitchen", { x: 600, y: 0 }, { x: 600, y: 450 }, 10),
  wall("w-middle", { x: 0, y: 450 }, { x: 1000, y: 450 }, 10),
  wall("w-hall-toilet", { x: 350, y: 450 }, { x: 350, y: 800 }, 10),
  wall("w-toilet-office", { x: 500, y: 450 }, { x: 500, y: 800 }, 10),
  wall("w-storage-top", { x: 500, y: 650 }, { x: 700, y: 650 }, 10),
  wall("w-storage-side", { x: 700, y: 650 }, { x: 700, y: 800 }, 10),
  // Doors.
  { id: "d-front", kind: "door", wallId: "w-bottom", offset: 825, width: 100, hingeAtEnd: false, swingFlipped: false },
  { id: "d-living", kind: "door", wallId: "w-middle", offset: 175, width: 90, hingeAtEnd: false, swingFlipped: true },
  { id: "d-kitchen", kind: "door", wallId: "w-living-kitchen", offset: 300, width: 90, hingeAtEnd: true, swingFlipped: false },
  { id: "d-office", kind: "door", wallId: "w-middle", offset: 850, width: 90, hingeAtEnd: true, swingFlipped: false },
  { id: "d-toilet", kind: "door", wallId: "w-hall-toilet", offset: 150, width: 70, hingeAtEnd: false, swingFlipped: false },
  { id: "d-storage", kind: "door", wallId: "w-storage-top", offset: 100, width: 70, hingeAtEnd: false, swingFlipped: false },
  // Windows.
  { id: "n-living", kind: "window", wallId: "w-top", offset: 300, width: 250 },
  { id: "n-kitchen", kind: "window", wallId: "w-top", offset: 800, width: 150 },
  { id: "n-office", kind: "window", wallId: "w-right", offset: 600, width: 120 },
  { id: "n-living-side", kind: "window", wallId: "w-left", offset: 600, width: 150 },
];

const outsideElements: PlanElement[] = [
  wall("w-shed-top", { x: 1450, y: 100 }, { x: 1750, y: 100 }, 10),
  wall("w-shed-right", { x: 1750, y: 100 }, { x: 1750, y: 400 }, 10),
  wall("w-shed-bottom", { x: 1750, y: 400 }, { x: 1450, y: 400 }, 10),
  wall("w-shed-left", { x: 1450, y: 400 }, { x: 1450, y: 100 }, 10),
  { id: "d-shed", kind: "door", wallId: "w-shed-bottom", offset: 150, width: 90, hingeAtEnd: false, swingFlipped: false },
];

const placesOn = (floor: Floor) => Object.values(placeFixtures).filter((candidate) => candidate.floorId === floor.id);

export const groundFloorPlanFixture: FloorPlan = { floor: ground, places: placesOn(ground), elements: groundElements };
export const outsidePlanFixture: FloorPlan = { floor: outside, places: placesOn(outside), elements: outsideElements };
/** Nothing drawn yet; two rooms wait in the tools window. */
export const firstFloorPlanFixture: FloorPlan = { floor: first, places: placesOn(first), elements: [] };

export const placesOverviewFixture: PlacesOverview = {
  floors: Object.values(floorFixtures),
  places: Object.values(placeFixtures),
};

export const placeDetailFixture: PlaceDetail = {
  place: placeFixtures.kitchen,
  plan: groundFloorPlanFixture,
  floors: Object.values(floorFixtures),
};

export const placeDetailNotDrawnFixture: PlaceDetail = {
  place: placeFixtures.bedroom,
  plan: firstFloorPlanFixture,
  floors: Object.values(floorFixtures),
};

export const placeSelectionsFixture = { favoriteIds: ["p-kitchen", "p-garden"], recentIds: ["p-office", "p-shed", "p-kitchen"] };

/** Generic markers on the ground floor, as another feature (devices) would build them. */
export const planMarkerFixtures: PlanMarker[] = [
  { id: "m-kitchen-window", x: 800, y: 30, tone: "danger", label: "Kitchen window · Open", icon: AppWindowIcon },
  { id: "m-living-window", x: 300, y: 30, tone: "success", label: "Living room window · Closed", icon: AppWindowIcon },
  { id: "m-thermostat", x: 150, y: 200, tone: "success", label: "Thermostat · Comfortable", icon: ThermometerIcon, value: "21,5 °C" },
  { id: "m-dryer", x: 600, y: 725, tone: "success", label: "Dryer · Running", icon: WashingMachineIcon, value: "1.250 W", pulse: true },
  { id: "m-alarm", x: 80, y: 740, tone: "warning", label: "Alarm panel · Armed (home)", icon: ShieldIcon },
  { id: "m-stale", x: 850, y: 600, tone: "neutral", label: "Office sensor · Unknown", icon: ThermometerIcon, dimmed: true },
];

export const planLegendFixture: PlanLegendItem[] = [
  { tone: "danger", label: "Open" },
  { tone: "success", label: "Closed / comfortable" },
  { tone: "success", label: "Running", pulse: true },
  { tone: "warning", label: "Armed (home)" },
  { tone: "neutral", label: "Unknown" },
];

export const planMarkerPaletteFixture: PlanMarkerPaletteEntry[] = [
  { id: "m-new-1", tone: "neutral", label: "Hall smoke detector", description: "Hall", icon: ShieldIcon },
  { id: "m-new-2", tone: "info", label: "Office thermostat", description: "Office", icon: ThermometerIcon },
];
