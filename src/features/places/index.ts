// Public API of the places feature. Routes, the app frame and other features import from here only.
export { FloorPlanView } from "./components/floor-plan-view";
export { PlaceBadge } from "./components/place-badge";
// The assistant's floor-plan preview (kind "plan-diff"); src/app/assistant-previews.ts loads it lazily.
export { default as PlanDiffPreview } from "./components/plan-diff-preview";
export { PlacePicker } from "./components/place-picker";
export {
  PlanLegend,
  PlanMarkerDot,
  PlanMarkerPaletteItem,
  type PlanLegendItem,
  type PlanMarker,
  type PlanMarkerIcon,
  type PlanMarkerPaletteEntry,
  type PlanMarkerTone,
} from "./components/plan-markers";
export {
  floorPlanAction,
  floorPlanLoader,
  placeDetailLoader,
  placesAction,
  placesLoader,
} from "./data/places-loaders";
export { fetchFloorPlan, fetchPlaces, fetchPlacesOverview } from "./data/places-requests";
export { usePlaceSelections } from "./data/use-place-selections";
export { FloorPlanScreen } from "./screens/floor-plan-screen";
export { PlaceDetailScreen } from "./screens/place-detail-screen";
export { PlacesScreen } from "./screens/places-screen";
export {
  canManagePlaces,
  isOutside,
  NO_PLACE_GROUP,
  placeGroupKey,
  placeGroupOrder,
  type Floor,
  type FloorKind,
  type FloorPlan,
  type Place,
  type PlaceKind,
  type PlacesOverview,
} from "./types/places";
export { PLAN_DIFF_KIND, type PlanDiffData } from "./types/plan-diff";
