import { api } from "@/lib/api-client";
import type {
  AlarmActionResponse,
  AlarmArmInput,
  AlarmOverview,
  HaApplianceLinksInput,
  HaConnectionStatus,
  HaEnergyOverview,
  HaEntitiesResponse,
  HaImportInput,
  HaImportResult,
  HaSettingsInput,
  HaSuggestionsResponse,
  HaTestResult,
} from "../types/home-assistant";

export const fetchHaStatus = () => api.get<HaConnectionStatus>("/home-assistant/status");
export const testHaConnection = () => api.post<HaTestResult>("/home-assistant/test");
export const fetchHaEntities = () => api.get<HaEntitiesResponse>("/home-assistant/entities");
export const fetchHaSuggestions = () => api.get<HaSuggestionsResponse>("/home-assistant/suggestions");
export const importHaDevices = (input: HaImportInput) => api.post<HaImportResult>("/home-assistant/import", input);
export const saveHaSettings = (input: HaSettingsInput) => api.put("/home-assistant/settings", input);

/**
 * The alarm card's data. A promise a loader can return un-awaited (`<Suspense fallback={<AlarmCardSkeleton />}>`).
 * Never rejects: a failure reads as "not configured", and the card then renders nothing.
 */
export const fetchAlarmOverview = (): Promise<AlarmOverview | null> => api.get<AlarmOverview>("/home-assistant/alarm").catch(() => null);
export const armAlarm = (input: AlarmArmInput) => api.post<AlarmActionResponse>("/home-assistant/alarm/arm", input);
/** UI only: the code is sent once to the server, which passes it to Home Assistant and never stores it. */
export const disarmAlarm = (code: string) => api.post<AlarmActionResponse>("/home-assistant/alarm/disarm", { code });

export const fetchHaEnergy = () => api.get<HaEnergyOverview>("/home-assistant/energy");
export const saveHaApplianceLinks = (input: HaApplianceLinksInput) => api.put("/home-assistant/energy/links", input);
export const startHaEnergyImport = () => api.post("/home-assistant/energy/import");
