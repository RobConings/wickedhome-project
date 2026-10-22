import type { HaApplianceLinksInput, HaEnergyOverview } from "@/features/home-assistant/types/home-assistant";
import {
  clearHomeAssistantIntervals,
  ensureHomeAssistantMeter,
  gasCalorificWhPerM3,
  linkHomeAssistantStatistic,
  listHomeAssistantMeters,
  upsertMeterIntervals,
  type HomeAssistantMeter,
  type MeterIntervalInput,
} from "../energy/energy.service";
import { db } from "../lib/db";
import { badRequest } from "../lib/http";
import { HaCommandError } from "./ha-client";
import { connectionStatusFor, haHouseholdId, isHaHousehold, requireConnectedClient } from "./ha-connection";
import {
  backfillStart,
  currentHourStart,
  parseEnergyPrefs,
  statisticsToIntervals,
  subtractIncluded,
  type HourInterval,
  type ParsedEnergyPrefs,
  type StatisticRow,
} from "./ha-energy-prefs";

/**
 * Hourly energy statistics from Home Assistant → energy intervals (source HOME_ASSISTANT).
 *
 * - Which statistics: `energy/get_prefs` (grid import/export per tariff, solar, battery, gas) become meters
 *   automatically; device-consumption statistics only once someone links them to an appliance.
 * - What: `recorder/statistics_during_period` with `period: "hour"`, `types: ["change"]`, in kWh / m³.
 * - From when: the last stored hour of each meter minus 3 hours (Home Assistant may still correct the latest
 *   hours), or, the first time, `energyBackfillDays` back to the start of that month.
 * - Idempotent: intervals are upserted per meter and hour, so running it twice changes nothing.
 * - Never double counted: the energy summary keeps, per bucket and kind, only the best source
 *   (Home Assistant > Fluvius > manual), and nested devices (`included_in_stat`) are subtracted from their parent.
 */

const HOUR_MS = 3_600_000;
const OVERLAP_HOURS = 3;
/** One request covers at most this many days (a statistic is 24 rows per day). */
const WINDOW_DAYS = 7;

type ImportContext = { signal?: AbortSignal; log?: (message: string) => void; now?: Date };

export type EnergyImportOutcome = { summary: string; skipped: boolean };

async function settingsFor(householdId: string) {
  return db.homeAssistantSettings.upsert({ where: { householdId }, create: { householdId }, update: {} });
}

async function readPrefs(): Promise<ParsedEnergyPrefs | null> {
  try {
    return parseEnergyPrefs(await requireConnectedClient().sendCommand({ type: "energy/get_prefs" }));
  } catch (error) {
    // `not_found`: the energy dashboard was never set up in Home Assistant.
    if (error instanceof HaCommandError && error.code === "not_found") return null;
    throw error;
  }
}

type StatMetadata = { statistic_id: string; unit_class?: string | null; statistics_unit_of_measurement?: string | null };

async function unitClasses(statisticIds: string[]): Promise<Map<string, "energy" | "volume">> {
  const result = new Map<string, "energy" | "volume">();
  if (!statisticIds.length) return result;
  const rows = await requireConnectedClient().sendCommand<StatMetadata[]>({ type: "recorder/get_statistics_metadata", statistic_ids: statisticIds });
  for (const row of rows ?? []) {
    const unit = (row.statistics_unit_of_measurement ?? "").toLowerCase();
    const volume = row.unit_class === "volume" || ["m³", "m3", "l", "ft³", "ccf"].includes(unit);
    result.set(row.statistic_id, volume ? "volume" : "energy");
  }
  return result;
}

async function fetchStatistics(statisticIds: string[], start: Date, end: Date, signal?: AbortSignal): Promise<Map<string, StatisticRow[]>> {
  const result = new Map<string, StatisticRow[]>(statisticIds.map((id) => [id, []]));
  for (let from = start.getTime(); from < end.getTime(); from += WINDOW_DAYS * 86_400_000) {
    signal?.throwIfAborted();
    const to = Math.min(end.getTime(), from + WINDOW_DAYS * 86_400_000);
    const response = await requireConnectedClient().sendCommand<Record<string, StatisticRow[]>>(
      {
        type: "recorder/statistics_during_period",
        start_time: new Date(from).toISOString(),
        end_time: new Date(to).toISOString(),
        statistic_ids: statisticIds,
        period: "hour",
        types: ["change"],
        units: { energy: "kWh", volume: "m³" },
      },
      120_000,
    );
    for (const [id, rows] of Object.entries(response ?? {})) result.get(id)?.push(...(rows ?? []));
  }
  return result;
}

/** Imports one household's statistics. Throws when Home Assistant can't be reached (the job run fails). */
export async function importHouseholdEnergy(householdId: string, context: ImportContext = {}): Promise<EnergyImportOutcome> {
  const { signal, log = () => undefined, now = new Date() } = context;
  const settings = await settingsFor(householdId);
  if (!settings.energyImportEnabled) return { summary: "Energy import is switched off", skipped: true };
  const prefs = await readPrefs();
  if (!prefs) return { summary: "Home Assistant has no energy dashboard configured", skipped: true };

  // Meters: grid/solar/battery/gas from the preferences; appliances only where someone linked them.
  const existing = await listHomeAssistantMeters(householdId);
  const meters = new Map<string, { id: string; lastAt: Date | null }>();
  for (const source of prefs.sources) {
    const id = await ensureHomeAssistantMeter(householdId, source);
    meters.set(source.statisticId, { id, lastAt: existing.find((meter) => meter.id === id)?.lastAt ?? null });
  }
  const linked = existing.filter((meter) => meter.kind === "appliance" && meter.applianceId);
  for (const meter of linked) meters.set(meter.statisticId, { id: meter.id, lastAt: meter.lastAt });
  if (meters.size === 0) return { summary: "No energy statistics to import", skipped: true };

  const end = currentHourStart(now);
  const firstStart = backfillStart(now, settings.energyBackfillDays);
  const startOf = (lastAt: Date | null) => (lastAt ? new Date(Math.max(firstStart.getTime(), lastAt.getTime() - OVERLAP_HOURS * HOUR_MS)) : firstStart);
  const start = new Date(Math.min(...[...meters.values()].map((meter) => startOf(meter.lastAt).getTime())));
  if (start >= end) return { summary: "Up to date", skipped: false };

  const statisticIds = [...meters.keys()];
  const gasIds = prefs.sources.filter((source) => source.carrier === "gas").map((source) => source.statisticId);
  const [rowsById, classes, calorific] = await Promise.all([
    fetchStatistics(statisticIds, start, end, signal),
    unitClasses(gasIds),
    gasIds.length ? gasCalorificWhPerM3(householdId) : Promise.resolve(null),
  ]);

  const intervalsById = new Map<string, HourInterval[]>();
  for (const [id, rows] of rowsById) {
    intervalsById.set(id, statisticsToIntervals(rows, { unitClass: classes.get(id) ?? "energy", calorificWhPerM3: calorific }));
  }
  // Nested devices: a linked parent keeps only what its linked children don't explain.
  const linkedIds = new Set(linked.map((meter) => meter.statisticId));
  for (const device of prefs.devices) {
    if (!linkedIds.has(device.statisticId)) continue;
    const children = prefs.devices.filter((child) => child.includedIn === device.statisticId && linkedIds.has(child.statisticId));
    if (!children.length) continue;
    intervalsById.set(
      device.statisticId,
      subtractIncluded(intervalsById.get(device.statisticId) ?? [], children.map((child) => intervalsById.get(child.statisticId) ?? [])),
    );
  }

  let inserted = 0;
  let updated = 0;
  let hours = 0;
  for (const [id, meter] of meters) {
    signal?.throwIfAborted();
    const from = startOf(meter.lastAt).getTime();
    const intervals: MeterIntervalInput[] = (intervalsById.get(id) ?? []).filter((interval) => interval.startAt.getTime() >= from && interval.endAt <= end);
    if (!intervals.length) continue;
    const written = await upsertMeterIntervals(meter.id, intervals);
    inserted += written.inserted;
    updated += written.updated;
    hours += intervals.length;
    log(`${id}: ${intervals.length} hours (${written.inserted} new)`);
  }
  const summary = `${meters.size} statistics, ${hours} hours (${inserted} new, ${updated} updated)`;
  await db.homeAssistantSettings.update({ where: { householdId }, data: { energyLastImportAt: now, energyLastResult: summary } });
  return { summary, skipped: false };
}

/** The job: the Home Assistant household, when connected. */
export async function importHomeAssistantEnergy(context: ImportContext = {}): Promise<EnergyImportOutcome> {
  const householdId = await haHouseholdId();
  if (!householdId) return { summary: "No household for Home Assistant (set HOME_ASSISTANT_HOUSEHOLD_ID)", skipped: true };
  requireConnectedClient();
  return importHouseholdEnergy(householdId, context);
}

/** Whether the first import (backfill) still has to happen for the Home Assistant household. */
export async function needsFirstImport(): Promise<boolean> {
  const householdId = await haHouseholdId();
  if (!householdId) return false;
  const settings = await db.homeAssistantSettings.findUnique({ where: { householdId } });
  return !settings || (settings.energyImportEnabled && !settings.energyLastImportAt);
}

// Overview and appliance links ------------------------------------------------------------------------------------

const meterInfo = (meter: HomeAssistantMeter | undefined) => ({ intervalCount: meter?.intervalCount ?? 0, lastAt: meter?.lastAt?.toISOString() ?? null });

export async function getEnergyOverview(householdId: string): Promise<HaEnergyOverview> {
  const status = await connectionStatusFor(householdId);
  const settings = await db.homeAssistantSettings.findUnique({ where: { householdId } });
  const meters = await listHomeAssistantMeters(householdId);
  const byStat = new Map(meters.map((meter) => [meter.statisticId, meter]));
  let prefs: ParsedEnergyPrefs | null = null;
  if (status.linked && status.state === "connected") {
    prefs = await readPrefs().catch((error: Error) => {
      console.warn("[home-assistant] energy prefs unavailable:", error.message);
      return null;
    });
  }
  return {
    status,
    enabled: settings?.energyImportEnabled ?? true,
    backfillDays: settings?.energyBackfillDays ?? 30,
    lastImportAt: settings?.energyLastImportAt?.toISOString() ?? null,
    lastResult: settings?.energyLastResult ?? null,
    sources: prefs ? prefs.sources.map((source) => ({ ...source, ...meterInfo(byStat.get(source.statisticId)) })) : null,
    devices: (prefs?.devices ?? []).map((device) => {
      const meter = byStat.get(device.statisticId);
      return {
        statisticId: device.statisticId,
        name: device.name,
        includedIn: device.includedIn,
        applianceId: meter?.kind === "appliance" ? meter.applianceId : null,
        ...meterInfo(meter?.kind === "appliance" ? meter : undefined),
      };
    }),
  };
}

/**
 * Saves statistic → appliance links. When a nested device's link changes, its parent's stored hours are
 * dropped and imported again, so the subtraction applies to its history too.
 */
export async function saveApplianceLinks(householdId: string, input: HaApplianceLinksInput): Promise<void> {
  if (!(await isHaHousehold(householdId))) throw badRequest("Home Assistant is not configured");
  const before = new Map((await listHomeAssistantMeters(householdId)).map((meter) => [meter.statisticId, meter.applianceId]));
  const prefs = await readPrefs().catch(() => null);
  const parents = new Set<string>();
  for (const link of input.links) {
    if ((before.get(link.statisticId) ?? null) === link.applianceId) continue;
    await linkHomeAssistantStatistic(householdId, link.statisticId, link.applianceId);
    const parent = prefs?.devices.find((device) => device.statisticId === link.statisticId)?.includedIn;
    if (parent) parents.add(parent);
  }
  for (const parent of parents) await clearHomeAssistantIntervals(householdId, parent);
}
