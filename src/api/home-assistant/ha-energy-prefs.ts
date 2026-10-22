import type { HaEnergyKind } from "@/features/home-assistant/types/home-assistant";

/**
 * Home Assistant energy preferences and statistics → WickedHome energy intervals. Pure, unit-tested
 * (home-assistant.test.ts); the import itself is in ha-energy.ts.
 *
 * `energy/get_prefs` returns `{ energy_sources: [...], device_consumption: [...] }`:
 * - grid: legacy `{ type: "grid", flow_from: [{ stat_energy_from }], flow_to: [{ stat_energy_to }] }`, or the newer
 *   flat shape with one `stat_energy_from` (import) and/or `stat_energy_to` (export) per grid entry
 * - solar: `{ type: "solar", stat_energy_from }`
 * - battery: `{ type: "battery", stat_energy_from (discharge), stat_energy_to (charge) }`
 * - gas: `{ type: "gas", stat_energy_from }` (m³ or kWh)
 * - device_consumption: `[{ stat_consumption, name?, included_in_stat? }]`
 */

export type EnergySourceSpec = {
  statisticId: string;
  kind: Exclude<HaEnergyKind, "appliance">;
  carrier: "electricity" | "gas";
  register: "single" | "day" | "night";
};

export type DeviceConsumptionSpec = { statisticId: string; name: string | null; includedIn: string | null };

export type ParsedEnergyPrefs = { sources: EnergySourceSpec[]; devices: DeviceConsumptionSpec[] };

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const statId = (value: unknown): string | null => (typeof value === "string" && /^[a-z0-9_]+[.:][a-z0-9_]+$/i.test(value.trim()) ? value.trim() : null);

/**
 * Belgian meters: tariff 1 = day, tariff 2 = night. Recognises the usual statistic names of the DSMR and
 * HomeWizard integrations (`…_tarif_1`, `…_tariff_2`, `…_import_t1`, `…_tarief_1`).
 */
export function registerOf(statisticId: string): "single" | "day" | "night" {
  const id = statisticId.toLowerCase();
  const match = /(?:^|[._])(?:t|tarif|tariff|tarief)_?([12])(?:$|[._])/.exec(id);
  if (match?.[1] === "1") return "day";
  if (match?.[1] === "2") return "night";
  return "single";
}

export function parseEnergyPrefs(raw: unknown): ParsedEnergyPrefs {
  const prefs = asObject(raw) ?? {};
  const sources: EnergySourceSpec[] = [];
  const seen = new Set<string>();
  const add = (id: string | null, kind: EnergySourceSpec["kind"], carrier: EnergySourceSpec["carrier"] = "electricity") => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    sources.push({ statisticId: id, kind, carrier, register: carrier === "electricity" && kind.startsWith("grid_") ? registerOf(id) : "single" });
  };

  for (const entry of asArray(prefs.energy_sources)) {
    const source = asObject(entry);
    if (!source) continue;
    switch (source.type) {
      case "grid":
        for (const flow of asArray(source.flow_from)) add(statId(asObject(flow)?.stat_energy_from), "grid_import");
        for (const flow of asArray(source.flow_to)) add(statId(asObject(flow)?.stat_energy_to), "grid_export");
        // Newer flat shape: one import and/or export statistic directly on the grid entry.
        add(statId(source.stat_energy_from), "grid_import");
        add(statId(source.stat_energy_to), "grid_export");
        break;
      case "solar":
        add(statId(source.stat_energy_from), "solar_production");
        break;
      case "battery":
        add(statId(source.stat_energy_from), "battery_discharge");
        add(statId(source.stat_energy_to), "battery_charge");
        break;
      case "gas":
        add(statId(source.stat_energy_from), "grid_import", "gas");
        break;
      default:
        break;
    }
  }

  const devices: DeviceConsumptionSpec[] = [];
  const deviceIds = new Set<string>();
  for (const entry of asArray(prefs.device_consumption)) {
    const device = asObject(entry);
    const id = statId(device?.stat_consumption);
    if (!device || !id || deviceIds.has(id)) continue;
    deviceIds.add(id);
    devices.push({
      statisticId: id,
      name: typeof device.name === "string" && device.name.trim() ? device.name.trim() : null,
      includedIn: statId(device.included_in_stat),
    });
  }
  return { sources, devices };
}

// Statistics → intervals --------------------------------------------------------------------------------------

/** One row of `recorder/statistics_during_period` (`start`/`end` are epoch ms in current HA, ISO in old ones). */
export type StatisticRow = { start: number | string; end?: number | string; change?: number | null };

export type HourInterval = {
  startAt: Date;
  endAt: Date;
  energyWh: number;
  volumeLitres: number | null;
  calorificWhPerM3: number | null;
};

const HOUR_MS = 3_600_000;

function toDate(value: number | string | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Hourly `change` values → intervals. Energy statistics are requested in kWh (`units: { energy: "kWh" }`), so
 * Wh = change × 1000. Gas in m³ keeps the volume (litres = m³ × 1000) and is converted with the calorific
 * value. Missing and negative changes (meter replaced, battery sign quirks) are skipped.
 */
export function statisticsToIntervals(
  rows: readonly StatisticRow[],
  { unitClass = "energy", calorificWhPerM3 = null }: { unitClass?: "energy" | "volume"; calorificWhPerM3?: number | null } = {},
): HourInterval[] {
  const result: HourInterval[] = [];
  for (const row of rows) {
    const startAt = toDate(row.start);
    if (!startAt || typeof row.change !== "number" || !Number.isFinite(row.change) || row.change < 0) continue;
    const endAt = toDate(row.end) ?? new Date(startAt.getTime() + HOUR_MS);
    if (unitClass === "volume") {
      const calorific = calorificWhPerM3 ?? 0;
      result.push({
        startAt,
        endAt,
        energyWh: Math.round(row.change * calorific),
        volumeLitres: Math.round(row.change * 1000),
        calorificWhPerM3: calorific || null,
      });
    } else {
      result.push({ startAt, endAt, energyWh: Math.round(row.change * 1000), volumeLitres: null, calorificWhPerM3: null });
    }
  }
  return result;
}

/**
 * A device whose consumption is also counted in another device's statistic (`included_in_stat`): when both
 * are linked to appliances, the parent keeps only what its linked children don't explain, so the appliance
 * breakdown (and "unknown") never counts the same Wh twice.
 */
export function subtractIncluded(parent: readonly HourInterval[], children: readonly (readonly HourInterval[])[]): HourInterval[] {
  const childWh = new Map<number, number>();
  for (const child of children) {
    for (const interval of child) childWh.set(interval.startAt.getTime(), (childWh.get(interval.startAt.getTime()) ?? 0) + interval.energyWh);
  }
  return parent.map((interval) => ({
    ...interval,
    energyWh: Math.max(0, interval.energyWh - (childWh.get(interval.startAt.getTime()) ?? 0)),
  }));
}

/** Start of the first import: `days` back, then to the first of that month (Europe/Brussels), so month buckets are whole. */
export function backfillStart(now: Date, days: number, timeZone = "Europe/Brussels"): Date {
  const back = new Date(now.getTime() - days * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(back);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  // Local midnight on the 1st: try UTC+1 and UTC+2 and keep the one that is midnight in Brussels.
  for (const offsetHours of [1, 2, 0]) {
    const candidate = new Date(Date.UTC(year, month - 1, 1, -offsetHours, 0, 0));
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(candidate);
    if (hour === "00") return candidate;
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

/** The start of the current (incomplete) hour: imports stop there. */
export const currentHourStart = (now: Date) => new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
