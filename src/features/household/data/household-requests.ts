import { api } from "@/lib/api-client";
import type { Habitant, HabitantInput, HouseholdOverview } from "../types/household";

export const fetchHouseholdOverview = () => api.get<HouseholdOverview>("/household");
export const createHabitant = (input: HabitantInput) => api.post<Habitant>("/household/habitants", input);
export const updateHabitant = (id: string, input: HabitantInput) =>
  api.put<Habitant>(`/household/habitants/${encodeURIComponent(id)}`, input);
export const deleteHabitant = (id: string) => api.delete(`/household/habitants/${encodeURIComponent(id)}`);
