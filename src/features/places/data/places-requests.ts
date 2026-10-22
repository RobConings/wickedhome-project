import { api, resourcePath, restResource } from "@/lib/api-client";
import type {
  Floor,
  FloorInput,
  FloorPlan,
  FloorPlanInput,
  Place,
  PlaceDetail,
  PlaceInput,
  PlacesOverview,
} from "../types/places";

const places = restResource<Place, PlaceInput, PlaceDetail>("/places");
const floors = restResource<Floor, FloorInput>("/places/floors");
const floorPath = resourcePath("/places/floors");

export const fetchPlacesOverview = () => api.get<PlacesOverview>("/places");
/** Every place of the household, ordered by floor then name. For pickers and other features. */
export const fetchPlaces = () => api.get<Place[]>("/places/all");
export const fetchPlaceDetail = places.get;
export const createPlace = places.create;
export const updatePlace = places.update;
export const deletePlace = places.remove;

export const createFloor = floors.create;
export const createStarterFloors = (names: { indoor: string; outdoor: string }) =>
  api.post<Floor[]>("/places/floors/starter", names);
export const updateFloor = floors.update;
export const deleteFloor = floors.remove;

export const fetchFloorPlan = (floorId: string) => api.get<FloorPlan>(floorPath(floorId, "plan"));
export const saveFloorPlan = (floorId: string, input: FloorPlanInput) => api.put<FloorPlan>(floorPath(floorId, "plan"), input);
