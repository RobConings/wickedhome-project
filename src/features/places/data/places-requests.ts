import { api } from "../lib/api-client";
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

const path = (id: string) => encodeURIComponent(id);

export const fetchPlacesOverview = () => api.get<PlacesOverview>("/places");
/** Every place of the household, ordered by floor then name. For pickers and other features. */
export const fetchPlaces = () => api.get<Place[]>("/places/all");
export const fetchPlaceDetail = (id: string) => api.get<PlaceDetail>(`/places/${path(id)}`);
export const createPlace = (input: PlaceInput) => api.post<Place>("/places", input);
export const updatePlace = (id: string, input: PlaceInput) => api.put<Place>(`/places/${path(id)}`, input);
export const deletePlace = (id: string) => api.delete(`/places/${path(id)}`);

export const createFloor = (input: FloorInput) => api.post<Floor>("/places/floors", input);
export const createStarterFloors = (names: { indoor: string; outdoor: string }) =>
  api.post<Floor[]>("/places/floors/starter", names);
export const updateFloor = (id: string, input: FloorInput) => api.put<Floor>(`/places/floors/${path(id)}`, input);
export const deleteFloor = (id: string) => api.delete(`/places/floors/${path(id)}`);

export const fetchFloorPlan = (floorId: string) => api.get<FloorPlan>(`/places/floors/${path(floorId)}/plan`);
export const saveFloorPlan = (floorId: string, input: FloorPlanInput) =>
  api.put<FloorPlan>(`/places/floors/${path(floorId)}/plan`, input);
