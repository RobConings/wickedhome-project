import { api, resourcePath, withQuery } from "@/lib/api-client";
import type { AutomationJob, AutomationsOverview, JobRun } from "../types/automations";

const jobPath = resourcePath("/jobs");

/** Every job with its state and recent runs. Loader-friendly: call it from the hosting route's loader. */
export const fetchAutomations = () => api.get<AutomationsOverview>("/jobs");
export const fetchAutomation = (id: string) => api.get<AutomationJob>(jobPath(id));
export const fetchAutomationRuns = (id: string, limit = 50) => api.get<JobRun[]>(withQuery(jobPath(id, "runs"), { limit }));
/** Starts a run in the background; the job comes back with `running: true`. 409 when it's already running. */
export const runAutomation = (id: string) => api.post<AutomationJob>(jobPath(id, "run"));
export const setAutomationEnabled = (id: string, enabled: boolean) => api.patch<AutomationJob>(jobPath(id), { enabled });

/** What `AutomationsSection` needs from the API; stories pass a fake. */
export type AutomationsClient = {
  list: () => Promise<AutomationsOverview>;
  get: (id: string) => Promise<AutomationJob>;
  run: (id: string) => Promise<AutomationJob>;
  setEnabled: (id: string, enabled: boolean) => Promise<AutomationJob>;
};

export const automationsClient: AutomationsClient = {
  list: fetchAutomations,
  get: fetchAutomation,
  run: runAutomation,
  setEnabled: setAutomationEnabled,
};
