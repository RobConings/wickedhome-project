import { api } from "@/lib/api-client";
import { todayIn } from "@/types/dates";
import {
  IMPORT_BATCH_SIZE,
  type Appliance,
  type ApplianceInput,
  type BatteryInput,
  type CurrentEnergySummary,
  type EnergyDataOverview,
  type EnergySettings,
  type EnergySettingsInput,
  type EnergySetup,
  type EnergySummary,
  type HomeBattery,
  type IntervalImport,
  type IntervalImportResult,
  type MeterReadingInput,
  type SolarInstallation,
  type SolarInstallationInput,
  type SummaryView,
} from "../types/energy";
import type { EnergyPeriod } from "../types/energy-period";
import { batchIntervals, type FluviusParseResult } from "../types/fluvius-csv";

const path = (id: string) => encodeURIComponent(id);

/**
 * Totals, series, breakdown and capacity peak for the period containing `date` (`YYYY-MM-DD`), for one
 * carrier or all energy together.
 */
export const fetchEnergySummary = (period: EnergyPeriod, date: string, carrier: SummaryView = "electricity") =>
  api.get<EnergySummary>(`/energy/summary?period=${period}&date=${date}&carrier=${carrier}`);

export const fetchAppliances = () => api.get<Appliance[]>("/energy/appliances");
export const createAppliance = (input: ApplianceInput) => api.post<Appliance>("/energy/appliances", input);
export const updateAppliance = (id: string, input: ApplianceInput) =>
  api.put<Appliance>(`/energy/appliances/${path(id)}`, input);
export const deleteAppliance = (id: string) => api.delete(`/energy/appliances/${path(id)}`);

export const fetchEnergySetup = () => api.get<EnergySetup>("/energy/setup");
export const createSolarInstallation = (input: SolarInstallationInput) =>
  api.post<SolarInstallation>("/energy/solar", input);
export const updateSolarInstallation = (id: string, input: SolarInstallationInput) =>
  api.put<SolarInstallation>(`/energy/solar/${path(id)}`, input);
export const deleteSolarInstallation = (id: string) => api.delete(`/energy/solar/${path(id)}`);
export const createBattery = (input: BatteryInput) => api.post<HomeBattery>("/energy/batteries", input);
export const updateBattery = (id: string, input: BatteryInput) =>
  api.put<HomeBattery>(`/energy/batteries/${path(id)}`, input);
export const deleteBattery = (id: string) => api.delete(`/energy/batteries/${path(id)}`);
export const saveEnergySettings = (input: EnergySettingsInput) => api.put<EnergySettings>("/energy/settings", input);

export const fetchEnergyData = () => api.get<EnergyDataOverview>("/energy/data");
export const importIntervals = (body: IntervalImport) =>
  api.post<IntervalImportResult>("/energy/intervals/import", body);
export const createReading = (input: MeterReadingInput) => api.post("/energy/readings", input);
export const deleteReading = (id: string) => api.delete(`/energy/readings/${path(id)}`);

export type FluviusUploadProgress = {
  /** Batches sent so far, out of `batches`. */
  batch: number;
  batches: number;
  /** Rows saved so far, out of `total`. */
  done: number;
  total: number;
};

export type FluviusUploadResult = IntervalImportResult & {
  batches: number;
  batchesDone: number;
  /** The user stopped the import; the batches already sent stay saved. */
  stopped: boolean;
};

/**
 * Sends a parsed Fluvius file to the API in batches. Re-sending is safe (the API upserts), so a failed or
 * stopped upload can simply be retried. Aborting `signal` stops before the next batch.
 */
export async function uploadFluviusFile(
  parsed: FluviusParseResult,
  options: { onProgress?: (progress: FluviusUploadProgress) => void; signal?: AbortSignal } = {},
): Promise<FluviusUploadResult> {
  const batches = batchIntervals(parsed.intervals, IMPORT_BATCH_SIZE);
  const total = parsed.intervals.length;
  const result: FluviusUploadResult = {
    received: 0,
    upserted: 0,
    inserted: 0,
    updated: 0,
    batches: batches.length,
    batchesDone: 0,
    stopped: false,
  };
  for (const intervals of batches) {
    if (options.signal?.aborted) return { ...result, stopped: true };
    const batch = await importIntervals({ source: "fluvius_csv", carrier: parsed.carrier, ean: parsed.ean, intervals });
    result.received += batch.received;
    result.upserted += batch.upserted;
    result.inserted += batch.inserted;
    result.updated += batch.updated;
    result.batchesDone += 1;
    options.onProgress?.({ batch: result.batchesDone, batches: batches.length, done: result.received, total });
  }
  return result;
}

/**
 * The current day/week/month/year for a dashboard widget: the electricity summary (as before) with the gas
 * summary of the same period under `gas`. Only the electricity request is essential: when the gas request
 * fails, `gas` is `null` and the widget leaves gas out instead of failing as a whole.
 */
export async function fetchCurrentEnergySummary(period: EnergyPeriod = "month"): Promise<CurrentEnergySummary> {
  const today = todayIn();
  const [electricity, gas] = await Promise.all([
    fetchEnergySummary(period, today, "electricity"),
    fetchEnergySummary(period, today, "gas").catch((error: unknown) => {
      console.warn("Energy: the gas summary could not load", error);
      return null;
    }),
  ]);
  return { ...electricity, gas };
}
