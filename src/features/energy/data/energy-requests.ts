import { api, resourcePath, restResource } from "@/lib/api-client";
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

const appliances = restResource<Appliance, ApplianceInput>("/energy/appliances");
const solar = restResource<SolarInstallation, SolarInstallationInput>("/energy/solar");
const batteries = restResource<HomeBattery, BatteryInput>("/energy/batteries");

/**
 * Totals, series, breakdown and capacity peak for the period containing `date` (`YYYY-MM-DD`), for one
 * carrier or all energy together.
 */
export const fetchEnergySummary = (period: EnergyPeriod, date: string, carrier: SummaryView = "electricity") =>
  api.get<EnergySummary>(`/energy/summary?period=${period}&date=${date}&carrier=${carrier}`);

export const fetchAppliances = () => appliances.list();
export const createAppliance = appliances.create;
export const updateAppliance = appliances.update;
export const deleteAppliance = appliances.remove;

export const fetchEnergySetup = () => api.get<EnergySetup>("/energy/setup");
export const createSolarInstallation = solar.create;
export const updateSolarInstallation = solar.update;
export const deleteSolarInstallation = solar.remove;
export const createBattery = batteries.create;
export const updateBattery = batteries.update;
export const deleteBattery = batteries.remove;
export const saveEnergySettings = (input: EnergySettingsInput) => api.put<EnergySettings>("/energy/settings", input);

export const fetchEnergyData = () => api.get<EnergyDataOverview>("/energy/data");
export const importIntervals = (body: IntervalImport) =>
  api.post<IntervalImportResult>("/energy/intervals/import", body);
export const createReading = (input: MeterReadingInput) => api.post("/energy/readings", input);
export const deleteReading = (id: string) => api.delete(resourcePath("/energy/readings")(id));

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
