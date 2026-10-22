import { api, restResource } from "@/lib/api-client";
import type { Habitant, HabitantInput, HouseholdOverview } from "../types/household";

const habitants = restResource<Habitant, HabitantInput>("/household/habitants");

export const fetchHouseholdOverview = () => api.get<HouseholdOverview>("/household");
export const createHabitant = habitants.create;
export const updateHabitant = habitants.update;
export const deleteHabitant = habitants.remove;
