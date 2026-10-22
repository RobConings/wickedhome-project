import type { Place } from "@/features/places/types/places";
import {
  CAPACITY_MINIMUM_KW,
  type Appliance,
  type AppliancePlace,
  type EnergyCarrier,
  type EnergyDataOverview,
  type EnergySeriesPoint,
  type EnergySetup,
  type EnergySummary,
  type HomeBattery,
  type MonthlyPeak,
  type SolarInstallation,
} from "@/features/energy/types/energy";
import { bucketLabels, periodRange, type EnergyPeriod } from "@/features/energy/types/energy-period";
import { parseFluviusCsv } from "@/features/energy/types/fluvius-csv";
import { placeFixtures } from "../places/fixtures";

/**
 * Example data for stories: a Flemish family of four. About 3,500 kWh of electricity a year, 6 kWp of solar
 * panels on the south roof, a hybrid heat pump next to the gas boiler, a gas hob, a jacuzzi in the garden and
 * quarter-hour peaks around 4–5 kW. About 12,000 kWh (≈ 1,050 m³) of gas a year, mostly in winter. A home
 * battery is planned for March 2027.
 */

export const TODAY = "2026-10-02";

// Places and appliances ------------------------------------------------------------------------------------

export const energyPlaceFixtures: Place[] = [
  placeFixtures.living,
  placeFixtures.kitchen,
  placeFixtures.office,
  placeFixtures.laundry,
  placeFixtures.garden,
  placeFixtures.jacuzzi,
  placeFixtures.driveway,
];

const at = (place: Place): AppliancePlace => ({
  id: place.id,
  name: place.name,
  kind: place.kind,
  color: place.color,
  icon: place.icon,
  floorName: place.floorName,
});

function appliance(
  id: string,
  name: string,
  category: Appliance["category"],
  place: Place | null,
  ratedPowerW: number | null,
  standbyPowerW: number | null,
  measured = false,
  notes: string | null = null,
  carriers: EnergyCarrier[] = ["electricity"],
): Appliance {
  return {
    id,
    name,
    category,
    carriers,
    placeId: place?.id ?? null,
    place: place && at(place),
    ratedPowerW,
    standbyPowerW,
    notes,
    measured,
  };
}

export const applianceFixtures = {
  heatPump: appliance("a-heatpump", "Hybrid heat pump", "heat_pump", placeFixtures.garden, 2400, 15, true, "Daikin Altherma 3, works with the gas boiler"),
  boiler: appliance("a-boiler", "Gas boiler", "heating", placeFixtures.storage, 90, 4, true, "Vaillant ecoTEC plus, also hot water", ["electricity", "gas"]),
  hob: appliance("a-gashob", "Gas hob", "cooking", placeFixtures.kitchen, null, null, false, null, ["gas"]),
  jacuzzi: appliance("a-jacuzzi", "Jacuzzi", "jacuzzi_pool", placeFixtures.jacuzzi, 3000, 40, true, "Cover on in winter!"),
  washer: appliance("a-washer", "Washing machine", "laundry", placeFixtures.laundry, 2100, 1),
  dryer: appliance("a-dryer", "Heat-pump dryer", "laundry", placeFixtures.laundry, 900, 1),
  dishwasher: appliance("a-dishwasher", "Dishwasher", "dishwasher", placeFixtures.kitchen, 1800, 1),
  oven: appliance("a-oven", "Oven", "cooking", placeFixtures.kitchen, 3500, 2),
  fridge: appliance("a-fridge", "Fridge-freezer", "cold", placeFixtures.kitchen, 120, null),
  tv: appliance("a-tv", "TV & soundbar", "it_media", placeFixtures.living, 180, 3),
  office: appliance("a-office", "Office PC & screens", "it_media", placeFixtures.office, 350, 6),
  tools: appliance("a-tools", "Lawn mower charger", "tools", null, 250, null),
} satisfies Record<string, Appliance>;

export const appliancesFixture = Object.values(applianceFixtures);

// Solar and battery ----------------------------------------------------------------------------------------

export const solarFixture: SolarInstallation = {
  id: "s-south",
  name: "South roof",
  panelCount: 15,
  panelWp: 400,
  kwp: 6,
  azimuthDeg: 180,
  tiltDeg: 35,
  inverterBrand: "SMA",
  inverterModel: "Sunny Boy 5.0",
  installedOn: "2021-04-12",
};

export const batteryFixture: HomeBattery = {
  id: "b-home",
  name: "Home battery",
  capacityWh: 10_000,
  maxChargeW: 5000,
  maxDischargeW: 5000,
  installedOn: "2027-03-01",
};

export const gasSettingsFixture = { gasEan: "541448820000077788", gasCalorificKwhPerM3: 11.4 };
export const setupFixture: EnergySetup = {
  solarInstallations: [solarFixture],
  batteries: [batteryFixture],
  settings: gasSettingsFixture,
};
export const eastWestSetupFixture: EnergySetup = {
  solarInstallations: [
    { ...solarFixture, id: "s-east", name: "East roof", panelCount: 8, kwp: 3.2, azimuthDeg: 90 },
    { ...solarFixture, id: "s-west", name: "West roof", panelCount: 8, kwp: 3.2, azimuthDeg: 270, inverterBrand: null, inverterModel: null },
  ],
  batteries: [],
  settings: gasSettingsFixture,
};
export const emptySetupFixture: EnergySetup = {
  solarInstallations: [],
  batteries: [],
  settings: { gasEan: null, gasCalorificKwhPerM3: 11.4 },
};

// Summaries ------------------------------------------------------------------------------------------------

/** Smooth, repeatable "randomness" so stories look real and never change between reloads. */
const wobble = (index: number, seed: number) => Math.sin(index * 1.7 + seed) * 0.5 + Math.sin(index * 0.37 + seed * 3) * 0.5;

type Bucket = { consumption: number; solar: number; directShare: number };

/** Splits consumption and solar into import, export and solar used directly. */
function point(label: string, { consumption, solar, directShare }: Bucket, solarMeasured: boolean): EnergySeriesPoint {
  const direct = Math.round(Math.min(consumption, solar) * directShare);
  const importWh = Math.round(consumption - direct);
  const exportWh = Math.round(solar - direct);
  return {
    label,
    importWh,
    exportWh,
    solarWh: solarMeasured ? Math.round(solar) : null,
    batteryChargeWh: null,
    batteryDischargeWh: null,
    consumptionWh: solarMeasured ? Math.round(consumption) : null,
    volumeLitres: null,
    electricityWh: solarMeasured ? Math.round(consumption) : null,
    gasWh: null,
  };
}

const PEAKS = [4.6, 4.2, 3.9, 3.4, 2.9, 2.6, 2.3, 2.7, 3.1, 4.8, 5.2, 4.4];

function peakHistory(month: string): MonthlyPeak[] {
  const [year = 2026, monthNumber = 1] = month.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 - (11 - index), 1));
    const label = date.toISOString().slice(0, 7);
    const kw = PEAKS[date.getUTCMonth()] ?? 3;
    return { month: label, kw, at: `${label}-14T17:45:00.000Z` };
  });
}

type SummaryOptions = {
  solarMeasured?: boolean;
  /** Share of consumption measured per appliance (jacuzzi, heat pump). */
  appliances?: { id: keyof typeof applianceFixtures; share: number }[];
  hasSolar?: boolean;
};

function buildSummary(
  period: EnergyPeriod,
  date: string,
  bucket: (index: number, label: string) => Bucket,
  { solarMeasured = true, hasSolar = true, appliances = [] }: SummaryOptions = {},
): EnergySummary {
  const { from, to } = periodRange(period, date);
  const series = bucketLabels(period, date).map((label, index) => point(label, bucket(index, label), solarMeasured));
  const sum = (key: keyof EnergySeriesPoint) => series.reduce((total, item) => total + (Number(item[key]) || 0), 0);
  const importWh = sum("importWh");
  const exportWh = sum("exportWh");
  const solarWh = solarMeasured ? sum("solarWh") : null;
  const consumptionWh = solarMeasured ? sum("consumptionWh") : null;
  const shares = appliances.map(({ id, share }) => ({
    applianceId: applianceFixtures[id].id,
    name: applianceFixtures[id].name,
    category: applianceFixtures[id].category,
    energyWh: Math.round((consumptionWh ?? importWh) * share),
  }));
  const measured = shares.reduce((total, share) => total + share.energyWh, 0);
  const month = [to.slice(0, 7), TODAY.slice(0, 7)].sort()[0] ?? TODAY.slice(0, 7);
  const lastMonth = period === "day" || period === "week" || period === "month" ? from.slice(0, 7) : month;
  const history = peakHistory(lastMonth);
  const current = history[history.length - 1] ?? { month: lastMonth, kw: null, at: null };

  return {
    carrier: "electricity",
    period,
    from,
    to,
    totals: {
      importWh,
      importDayWh: Math.round(importWh * 0.58),
      importNightWh: importWh - Math.round(importWh * 0.58),
      exportWh,
      solarWh,
      batteryChargeWh: null,
      batteryDischargeWh: null,
      consumptionWh,
      selfSufficiency: consumptionWh ? 1 - importWh / consumptionWh : null,
      selfConsumption: solarWh ? (solarWh - exportWh) / solarWh : null,
      volumeLitres: null,
      calorificKwhPerM3: null,
    },
    series,
    breakdown: {
      appliances: shares.sort((a, b) => b.energyWh - a.energyWh),
      unknownWh: consumptionWh === null ? null : Math.max(0, consumptionWh - measured),
      totalWh: consumptionWh,
    },
    peak: {
      ...current,
      billedKw: Math.max(CAPACITY_MINIMUM_KW, current.kw ?? 0),
      history,
      rollingAverageKw:
        Math.round((history.reduce((total, peak) => total + Math.max(CAPACITY_MINIMUM_KW, peak.kw ?? 0), 0) / 12) * 100) / 100,
    },
    status: {
      hasGridData: true,
      hasElectricityData: true,
      hasGasData: true,
      hasSolar,
      hasBattery: false,
      solarMeasured,
      batteryMeasured: false,
      applianceCount: appliancesFixture.length,
    },
  };
}

/** Hourly use on a sunny September day: jacuzzi heating at night, cooking at 18 h, solar peak at 13 h. */
const DAY_USE = [380, 520, 1650, 1600, 300, 260, 310, 720, 540, 330, 300, 340, 520, 380, 300, 320, 420, 760, 1350, 980, 640, 520, 460, 400];
const daySolar = (hour: number) => (hour < 7 || hour > 19 ? 0 : Math.round(Math.max(0, Math.sin(((hour - 6.5) / 13.5) * Math.PI)) * 4300));

export const daySummaryFixture = buildSummary(
  "day",
  "2026-09-15",
  (hour) => ({ consumption: DAY_USE[hour] ?? 300, solar: daySolar(hour), directShare: 0.9 }),
  { appliances: [{ id: "jacuzzi", share: 0.3 }, { id: "heatPump", share: 0.04 }] },
);

/** September 2026: ~8.7 kWh a day, ~17 kWh of solar a day. */
export const monthSummaryFixture = buildSummary(
  "month",
  "2026-09-01",
  (day) => ({
    consumption: 8700 + wobble(day, 1) * 1800,
    solar: Math.max(3000, 17_000 + wobble(day, 4) * 9000 - day * 120),
    directShare: 0.55,
  }),
  { appliances: [{ id: "jacuzzi", share: 0.28 }, { id: "heatPump", share: 0.07 }] },
);

export const weekSummaryFixture = buildSummary(
  "week",
  "2026-09-14",
  (day) => ({ consumption: 8900 + wobble(day, 2) * 1500, solar: 15_000 + wobble(day, 6) * 7000, directShare: 0.55 }),
  { appliances: [{ id: "jacuzzi", share: 0.27 }, { id: "heatPump", share: 0.06 }] },
);

/** 2025 per month: more use in winter (heat pump), Belgian solar yield per kWp. */
const YEAR_USE = [420, 370, 330, 260, 220, 200, 200, 210, 240, 300, 360, 420];
const YEAR_SOLAR_PER_KWP = [20, 35, 65, 95, 115, 120, 120, 105, 80, 50, 25, 15];
export const yearSummaryFixture = buildSummary(
  "year",
  "2025-01-01",
  (month) => ({
    consumption: (YEAR_USE[month] ?? 300) * 1000,
    solar: (YEAR_SOLAR_PER_KWP[month] ?? 50) * 6 * 1000,
    directShare: 0.55,
  }),
  { appliances: [{ id: "heatPump", share: 0.24 }, { id: "jacuzzi", share: 0.21 }] },
);

/** Only the Fluvius file: solar panels exist but their production is unknown. */
export const gridOnlySummaryFixture = buildSummary(
  "month",
  "2026-09-01",
  (day) => ({
    consumption: 8700 + wobble(day, 1) * 1800,
    solar: Math.max(3000, 17_000 + wobble(day, 4) * 9000 - day * 120),
    directShare: 0.55,
  }),
  { solarMeasured: false },
);

/** Solar measured, but no appliance has its own meter yet: everything is Unknown. */
export const nothingMeasuredSummaryFixture: EnergySummary = {
  ...monthSummaryFixture,
  breakdown: { ...monthSummaryFixture.breakdown, appliances: [], unknownWh: monthSummaryFixture.breakdown.totalWh },
};

export const emptySummaryFixture: EnergySummary = {
  ...buildSummary("month", "2026-10-01", () => ({ consumption: 0, solar: 0, directShare: 0 })),
  breakdown: { appliances: [], unknownWh: 0, totalWh: 0 },
  peak: {
    month: "2026-10",
    kw: null,
    at: null,
    billedKw: CAPACITY_MINIMUM_KW,
    history: peakHistory("2026-10").map((peak) => ({ ...peak, kw: null, at: null })),
    rollingAverageKw: null,
  },
  status: {
    hasGridData: false,
    hasElectricityData: false,
    hasGasData: false,
    hasSolar: false,
    hasBattery: false,
    solarMeasured: false,
    batteryMeasured: false,
    applianceCount: 0,
  },
};

// Gas ----------------------------------------------------------------------------------------------------------

const CALORIFIC = 11.4;
/** Gas per month in 2025, kWh: heating makes winter ten times summer (≈ 12,000 kWh a year). */
const GAS_MONTHS = [2100, 1850, 1500, 950, 480, 230, 190, 200, 370, 900, 1450, 1900];

type GasOptions = { appliances?: { id: keyof typeof applianceFixtures; share: number }[] };

/** A gas summary: consumption = gas offtake, with the volume in m³ at a fixed calorific value. */
function buildGasSummary(period: EnergyPeriod, date: string, bucketWh: (index: number) => number, { appliances = [] }: GasOptions = {}): EnergySummary {
  const electricity = buildSummary(period, date, () => ({ consumption: 0, solar: 0, directShare: 0 }));
  const series: EnergySeriesPoint[] = bucketLabels(period, date).map((label, index) => {
    const wh = Math.round(bucketWh(index));
    return {
      label,
      importWh: wh,
      exportWh: 0,
      solarWh: null,
      batteryChargeWh: null,
      batteryDischargeWh: null,
      consumptionWh: wh,
      volumeLitres: Math.round(wh / CALORIFIC),
      electricityWh: null,
      gasWh: wh,
    };
  });
  const total = series.reduce((sum, point) => sum + point.importWh, 0);
  const shares = appliances.map(({ id, share }) => ({
    applianceId: applianceFixtures[id].id,
    name: applianceFixtures[id].name,
    category: applianceFixtures[id].category,
    energyWh: Math.round(total * share),
  }));
  return {
    ...electricity,
    carrier: "gas",
    totals: {
      importWh: total,
      importDayWh: 0,
      importNightWh: 0,
      exportWh: 0,
      solarWh: null,
      batteryChargeWh: null,
      batteryDischargeWh: null,
      consumptionWh: total,
      selfSufficiency: null,
      selfConsumption: null,
      volumeLitres: Math.round(total / CALORIFIC),
      calorificKwhPerM3: CALORIFIC,
    },
    series,
    breakdown: {
      appliances: shares,
      unknownWh: Math.max(0, total - shares.reduce((sum, share) => sum + share.energyWh, 0)),
      totalWh: total,
    },
    peak: yearSummaryFixture.peak,
    status: { ...electricity.status, hasGridData: true, hasElectricityData: true, hasGasData: true },
  };
}

/** A cold January day: the boiler runs from 6 h and in the evening, the hob at 18 h. */
const GAS_DAY = [600, 500, 500, 500, 600, 1800, 6200, 5400, 3800, 2600, 2100, 1900, 2000, 1800, 1900, 2300, 3200, 4600, 5600, 4900, 4100, 3200, 1800, 900];
export const gasDaySummaryFixture = buildGasSummary("day", "2026-01-14", (hour) => GAS_DAY[hour] ?? 1000, {
  appliances: [{ id: "boiler", share: 0.93 }],
});
export const gasMonthSummaryFixture = buildGasSummary(
  "month",
  "2026-09-01",
  (day) => 9000 + wobble(day, 3) * 4000 + day * 250,
  { appliances: [{ id: "boiler", share: 0.86 }] },
);
export const gasYearSummaryFixture = buildGasSummary("year", "2025-01-01", (month) => (GAS_MONTHS[month] ?? 500) * 1000, {
  appliances: [{ id: "boiler", share: 0.9 }],
});

/** Electricity and gas together for 2025 (≈ 3,500 + 12,000 kWh). */
export const totalYearSummaryFixture: EnergySummary = (() => {
  const series = yearSummaryFixture.series.map((point, index) => {
    const gasWh = gasYearSummaryFixture.series[index]?.gasWh ?? 0;
    const electricityWh = point.consumptionWh ?? 0;
    return { ...point, importWh: point.importWh + gasWh, consumptionWh: electricityWh + gasWh, electricityWh, gasWh };
  });
  const total = series.reduce((sum, point) => sum + (point.consumptionWh ?? 0), 0);
  const heatPump = yearSummaryFixture.breakdown.appliances;
  const boiler = gasYearSummaryFixture.breakdown.appliances;
  const appliances = [...boiler, ...heatPump].sort((a, b) => b.energyWh - a.energyWh);
  return {
    ...yearSummaryFixture,
    carrier: "total",
    series,
    totals: {
      ...yearSummaryFixture.totals,
      importWh: yearSummaryFixture.totals.importWh + gasYearSummaryFixture.totals.importWh,
      consumptionWh: total,
      selfSufficiency: null,
    },
    breakdown: {
      appliances,
      unknownWh: total - appliances.reduce((sum, share) => sum + share.energyWh, 0),
      totalWh: total,
    },
  };
})();

/** Total energy when only electricity has data. */
export const totalWithoutGasSummaryFixture: EnergySummary = {
  ...monthSummaryFixture,
  carrier: "total",
  series: monthSummaryFixture.series.map((point) => ({ ...point, gasWh: null })),
  totals: { ...monthSummaryFixture.totals, selfSufficiency: null },
  status: { ...monthSummaryFixture.status, hasGasData: false },
};

export const gasEmptySummaryFixture: EnergySummary = {
  ...emptySummaryFixture,
  carrier: "gas",
};

// Data sources -----------------------------------------------------------------------------------------------

export const dataOverviewFixture: EnergyDataOverview = {
  meters: [
    { id: "m1", name: "", carrier: "electricity", kind: "grid_import", register: "day", source: "fluvius_csv", ean: "541448820044455566", applianceId: null, intervalCount: 34_944, firstAt: "2025-09-30T22:00:00.000Z", lastAt: "2026-09-30T22:00:00.000Z" },
    { id: "m2", name: "", carrier: "electricity", kind: "grid_import", register: "night", source: "fluvius_csv", ean: "541448820044455566", applianceId: null, intervalCount: 34_944, firstAt: "2025-09-30T22:00:00.000Z", lastAt: "2026-09-30T22:00:00.000Z" },
    { id: "m3", name: "", carrier: "electricity", kind: "grid_export", register: "day", source: "fluvius_csv", ean: "541448820044455566", applianceId: null, intervalCount: 34_944, firstAt: "2025-09-30T22:00:00.000Z", lastAt: "2026-09-30T22:00:00.000Z" },
    { id: "m4", name: "", carrier: "electricity", kind: "grid_export", register: "night", source: "fluvius_csv", ean: "541448820044455566", applianceId: null, intervalCount: 34_944, firstAt: "2025-09-30T22:00:00.000Z", lastAt: "2026-09-30T22:00:00.000Z" },
    { id: "m5", name: "", carrier: "electricity", kind: "solar_production", register: "single", source: "manual", ean: null, applianceId: null, intervalCount: 12, firstAt: "2025-10-01T07:00:00.000Z", lastAt: "2026-10-01T07:00:00.000Z" },
    { id: "m7", name: "", carrier: "gas", kind: "grid_import", register: "single", source: "fluvius_csv", ean: "541448820000077788", applianceId: null, intervalCount: 8760, firstAt: "2025-09-30T22:00:00.000Z", lastAt: "2026-09-30T22:00:00.000Z" },
    { id: "m6", name: "", carrier: "electricity", kind: "appliance", register: "single", source: "manual", ean: null, applianceId: applianceFixtures.jacuzzi.id, intervalCount: 8, firstAt: "2026-02-01T08:00:00.000Z", lastAt: "2026-10-01T08:00:00.000Z" },
  ],
  readings: [
    { id: "r0", meterId: "m8", carrier: "gas", kind: "grid_import", register: "single", applianceName: null, readAt: "2026-10-01T07:05:00.000Z", valueWh: 59_571_600, valueLitres: 5_225_580 },
    { id: "r1", meterId: "m5", carrier: "electricity", kind: "solar_production", register: "single", applianceName: null, readAt: "2026-10-01T07:00:00.000Z", valueWh: 27_684_300, valueLitres: null },
    { id: "r2", meterId: "m6", carrier: "electricity", kind: "appliance", register: "single", applianceName: "Jacuzzi", readAt: "2026-10-01T08:00:00.000Z", valueWh: 4_812_600, valueLitres: null },
    { id: "r3", meterId: "m5", carrier: "electricity", kind: "solar_production", register: "single", applianceName: null, readAt: "2026-09-01T07:00:00.000Z", valueWh: 27_166_100, valueLitres: null },
    { id: "r4", meterId: "m6", carrier: "electricity", kind: "appliance", register: "single", applianceName: "Jacuzzi", readAt: "2026-09-01T08:00:00.000Z", valueWh: 4_739_900, valueLitres: null },
  ],
};

export const emptyDataOverviewFixture: EnergyDataOverview = { meters: [], readings: [] };

// A real-looking Fluvius file ----------------------------------------------------------------------------------

const BOM = String.fromCharCode(0xfeff);
const HEADER = "Van datum;Van tijdstip;Tot datum;Tot tijdstip;EAN;Meter;Metertype;Register;Volume;Eenheid;Validatiestatus";
const pad = (value: number) => String(value).padStart(2, "0");
const kwh = (wh: number) => (wh / 1000).toFixed(3).replace(".", ",");

/** One week of quarter-hours (1–7 September 2026) in the Dutch export format, built from the day profile. */
export function fluviusCsvFixture(days = 7): string {
  const rows = [BOM + HEADER];
  for (let day = 1; day <= days; day++) {
    const date = `${pad(day)}-09-2026`;
    for (let quarter = 0; quarter < 96; quarter++) {
      const hour = Math.floor(quarter / 4);
      const minute = (quarter % 4) * 15;
      const end = quarter === 95 ? { date: `${pad(day + 1)}-09-2026`, time: "00:00:00" } : { date, time: `${pad(Math.floor((quarter + 1) / 4))}:${pad(((quarter + 1) % 4) * 15)}:00` };
      const use = ((DAY_USE[hour] ?? 300) / 4) * (1 + wobble(quarter + day * 96, 2) * 0.4);
      const sun = (daySolar(hour) / 4) * (0.7 + wobble(day, 5) * 0.3);
      const direct = Math.min(use, sun) * 0.9;
      const offtake = Math.max(0, use - direct);
      const injection = Math.max(0, sun - direct);
      // Night tariff: 22–7 h on weekdays and all weekend (5 and 6 September 2026 are a Saturday and Sunday).
      const night = hour < 7 || hour >= 22 || day === 5 || day === 6;
      const tariff = night ? "Nacht" : "Dag";
      const other = night ? "Dag" : "Nacht";
      const start = `${date};${pad(hour)}:${pad(minute)}:00;${end.date};${end.time};="541448820044455566";1SAG1100042;Digitale Meter`;
      rows.push(`${start};Afname ${tariff};${kwh(offtake)};kWh;Gevalideerd`);
      rows.push(`${start};Afname ${other};;kWh;Geen verbruik`);
      rows.push(`${start};Injectie ${tariff};${injection > 0 ? kwh(injection) : ""};kWh;${injection > 0 ? "Gevalideerd" : "Geen verbruik"}`);
      rows.push(`${start};Injectie ${other};;kWh;Geen verbruik`);
    }
  }
  return rows.join("\r\n");
}

export const fluviusPreviewFixture = {
  fileName: "Verbruikshistoriek_elektriciteit_541448820044455566_20260901_20260907_kwartiertotalen.csv",
  parsed: parseFluviusCsv(fluviusCsvFixture()),
};

/** One January week of hourly gas in the Fluvius format: an m³ row and a kWh row per hour. */
export function fluviusGasCsvFixture(days = 7): string {
  const header = `${HEADER};Omrekeningsfactor;Calorische Bovenwaarde`;
  const rows = [BOM + header];
  for (let day = 5; day < 5 + days; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const date = `${pad(day)}-01-2026`;
      const end = hour === 23 ? { date: `${pad(day + 1)}-01-2026`, time: "00:00:00" } : { date, time: `${pad(hour + 1)}:00:00` };
      const calorific = (11.4 + wobble(day, 1) * 0.15).toFixed(3).replace(".", ",");
      const kwhValue = (GAS_DAY[hour] ?? 1000) * (1 + wobble(hour + day * 24, 4) * 0.25);
      const m3 = kwhValue / 1000 / Number(calorific.replace(",", "."));
      const start = `${date};${pad(hour)}:00:00;${end.date};${end.time};="541448820000077788";2GAS0077788;Digitale Meter;Afname`;
      rows.push(`${start};${m3.toFixed(3).replace(".", ",")};m³;Gevalideerd;;${calorific}`);
      rows.push(`${start};${kwh(kwhValue)};kWh;Gevalideerd;;${calorific}`);
    }
  }
  return rows.join("\r\n");
}

export const fluviusGasPreviewFixture = {
  fileName: "Verbruikshistoriek_gas_541448820000077788_20260105_20260111_uurtotalen.csv",
  parsed: parseFluviusCsv(fluviusGasCsvFixture(), {
    fileName: "Verbruikshistoriek_gas_541448820000077788_20260105_20260111_uurtotalen.csv",
  }),
};
