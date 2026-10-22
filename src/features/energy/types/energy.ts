import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import { energyPeriodSchema, type EnergyPeriod } from "./energy-period";
import { zonedDateTimeToIso } from "./energy-time";

// Enums --------------------------------------------------------------------------------------------------

/** Energy carriers. Energy is always stored in Wh; gas and water also keep their volume (litres). */
export const ENERGY_CARRIERS = ["electricity", "gas", "water"] as const;
export const energyCarrierSchema = z.enum(ENERGY_CARRIERS);
export type EnergyCarrier = z.infer<typeof energyCarrierSchema>;

/** Carriers with data and screens today; water is modelled for later. */
export const ACTIVE_CARRIERS = ["electricity", "gas"] as const;
export const activeCarrierSchema = z.enum(ACTIVE_CARRIERS);
export type ActiveCarrier = z.infer<typeof activeCarrierSchema>;

/** Tabs of the overview: one carrier, or all energy together in kWh. */
export const SUMMARY_VIEWS = ["electricity", "gas", "total"] as const;
export const summaryViewSchema = z.enum(SUMMARY_VIEWS);
export type SummaryView = z.infer<typeof summaryViewSchema>;

/** Typical gross calorific value of Belgian H-gas, for manual m³ readings until the household sets its own. */
export const DEFAULT_GAS_CALORIFIC_KWH_PER_M3 = 11.4;

export const APPLIANCE_CATEGORIES = [
  "heating",
  "heat_pump",
  "cooking",
  "laundry",
  "dishwasher",
  "cold",
  "jacuzzi_pool",
  "ev_charger",
  "it_media",
  "lighting",
  "tools",
  "other",
] as const;
export const applianceCategorySchema = z.enum(APPLIANCE_CATEGORIES);
export type ApplianceCategory = z.infer<typeof applianceCategorySchema>;

export const METER_KINDS = [
  "grid_import",
  "grid_export",
  "solar_production",
  "battery_charge",
  "battery_discharge",
  "appliance",
] as const;
export const meterKindSchema = z.enum(METER_KINDS);
export type MeterKind = z.infer<typeof meterKindSchema>;

/** Tariff register. Belgian digital meters: tariff 1 = day, tariff 2 = night. */
export const ENERGY_REGISTERS = ["single", "day", "night"] as const;
export const energyRegisterSchema = z.enum(ENERGY_REGISTERS);
export type EnergyRegister = z.infer<typeof energyRegisterSchema>;

export const ENERGY_SOURCES = ["manual", "fluvius_csv", "home_assistant"] as const;
export const energySourceSchema = z.enum(ENERGY_SOURCES);
export type EnergySource = z.infer<typeof energySourceSchema>;

export const INTERVAL_STATUSES = ["validated", "estimated", "no_usage", "measured"] as const;
export const intervalStatusSchema = z.enum(INTERVAL_STATUSES);
export type IntervalStatus = z.infer<typeof intervalStatusSchema>;

/** Flemish capacity tariff: every month is billed at least this peak. */
export const CAPACITY_MINIMUM_KW = 2.5;

// Field helpers --------------------------------------------------------------------------------------------

/** Meter kinds a gas meter can have: the connection itself, or a sub-meter on an appliance. */
export const GAS_METER_KINDS: readonly MeterKind[] = ["grid_import", "appliance"];

/** Accepts "1,5" as well as "1.5" (Belgian keyboards), from forms and JSON alike. */
const decimal = () =>
  z.preprocess((value) => (typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value), z.coerce.number());

const optionalInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max).optional().nullable();
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

// Inputs ---------------------------------------------------------------------------------------------------

/** A list of carriers from JSON (`["gas"]`) or a form field (`"electricity,gas"`), without duplicates. */
const carriersSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.split(",").filter(Boolean) : value),
  z
    .array(activeCarrierSchema)
    .min(1)
    .transform((list) => ACTIVE_CARRIERS.filter((carrier) => list.includes(carrier))),
);

export const applianceInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: applianceCategorySchema,
  carriers: carriersSchema.default(["electricity"]),
  placeId: idSchema.optional().nullable(),
  ratedPowerW: optionalInt(0, 100_000),
  standbyPowerW: optionalInt(0, 10_000),
  notes: optionalText(500),
});
export type ApplianceInput = z.infer<typeof applianceInputSchema>;

export const solarInstallationInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  panelCount: z.coerce.number().int().min(1).max(1000),
  panelWp: z.coerce.number().int().min(50).max(1000),
  azimuthDeg: optionalInt(0, 359),
  tiltDeg: optionalInt(0, 90),
  inverterBrand: optionalText(60),
  inverterModel: optionalText(60),
  installedOn: isoDateSchema.optional().nullable(),
});
export type SolarInstallationInput = z.infer<typeof solarInstallationInputSchema>;

export const batteryInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  capacityWh: z.number().int().min(100).max(1_000_000),
  maxChargeW: z.number().int().min(0).max(100_000).optional().nullable(),
  maxDischargeW: z.number().int().min(0).max(100_000).optional().nullable(),
  installedOn: isoDateSchema.optional().nullable(),
});
export type BatteryInput = z.infer<typeof batteryInputSchema>;

/** The battery form speaks kWh and kW; it becomes a `BatteryInput` in Wh and W. */
export const batteryFormSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    capacityKwh: decimal().pipe(z.number().min(0.1).max(1000)),
    maxChargeKw: decimal().pipe(z.number().min(0).max(100)).optional(),
    maxDischargeKw: decimal().pipe(z.number().min(0).max(100)).optional(),
    installedOn: isoDateSchema.optional(),
  })
  .transform(
    (form): BatteryInput => ({
      name: form.name,
      capacityWh: Math.round(form.capacityKwh * 1000),
      maxChargeW: form.maxChargeKw === undefined ? null : Math.round(form.maxChargeKw * 1000),
      maxDischargeW: form.maxDischargeKw === undefined ? null : Math.round(form.maxDischargeKw * 1000),
      installedOn: form.installedOn ?? null,
    }),
  );

/**
 * A manual reading. Electricity meters show kWh (`valueWh`); the gas meter shows m³ (`valueLitres`), which
 * the API converts with the household's calorific value. Appliance readings need an appliance.
 */
export const meterReadingInputSchema = z
  .object({
    carrier: activeCarrierSchema.default("electricity"),
    kind: meterKindSchema,
    register: energyRegisterSchema,
    applianceId: idSchema.optional().nullable(),
    readAt: z.iso.datetime({ offset: true }),
    /** Cumulative register value in Wh (electricity). */
    valueWh: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
    /** Cumulative register value in litres = m³ × 1000 (gas). */
    valueLitres: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  })
  .refine((input) => input.kind !== "appliance" || Boolean(input.applianceId), {
    message: "Choose the appliance this meter measures",
    path: ["applianceId"],
  })
  .refine((input) => input.carrier !== "gas" || GAS_METER_KINDS.includes(input.kind), {
    message: "A gas meter measures the connection or an appliance",
    path: ["kind"],
  })
  .refine((input) => (input.carrier === "gas" ? input.valueLitres != null : input.valueWh != null), {
    message: "Enter the meter value",
    path: ["value"],
  });
export type MeterReadingInput = z.infer<typeof meterReadingInputSchema>;

/** Meters the reading form offers: every electricity kind, plus the gas meter and gas sub-meters. */
export const READING_METERS = [...METER_KINDS, "gas", "gas_appliance"] as const;
export type ReadingMeter = (typeof READING_METERS)[number];

export const readingMeterCarrier = (meter: ReadingMeter): ActiveCarrier =>
  meter === "gas" || meter === "gas_appliance" ? "gas" : "electricity";

/** The reading form: local date + time and a value (kWh, or m³ for gas) with a comma or a dot. */
export const meterReadingFormSchema = z
  .object({
    meter: z.enum(READING_METERS),
    register: energyRegisterSchema.default("single"),
    applianceId: idSchema.optional(),
    date: isoDateSchema,
    time: z.string().regex(/^\d{2}:\d{2}$/),
    value: decimal().pipe(z.number().min(0).max(2_000_000)),
  })
  .refine((form) => !(form.meter === "appliance" || form.meter === "gas_appliance") || Boolean(form.applianceId), {
    message: "Choose the appliance this meter measures",
    path: ["applianceId"],
  })
  .transform((form): MeterReadingInput => {
    const carrier = readingMeterCarrier(form.meter);
    const kind: MeterKind = form.meter === "gas" ? "grid_import" : form.meter === "gas_appliance" ? "appliance" : form.meter;
    const units = Math.round(form.value * 1000);
    return {
      carrier,
      kind,
      register: carrier === "electricity" && (kind === "grid_import" || kind === "grid_export") ? form.register : "single",
      applianceId: kind === "appliance" ? (form.applianceId ?? null) : null,
      readAt: zonedDateTimeToIso(form.date, form.time),
      valueWh: carrier === "electricity" ? units : null,
      valueLitres: carrier === "gas" ? units : null,
    };
  });

/** The gas settings form: EAN and the calorific value in kWh/m³. */
export const energySettingsFormSchema = z
  .object({
    gasEan: z.string().trim().max(40).optional(),
    gasCalorificKwhPerM3: decimal().pipe(z.number().min(8).max(13)),
  })
  .transform((form): EnergySettingsInput => ({
    gasEan: form.gasEan || null,
    gasCalorificWhPerM3: Math.round(form.gasCalorificKwhPerM3 * 1000),
  }));

export const energySettingsInputSchema = z.object({
  gasEan: z.string().trim().max(40).optional().nullable(),
  /** Gross calorific value in Wh/m³ (11.4 kWh/m³ = 11400). */
  gasCalorificWhPerM3: z.number().int().min(8000).max(13_000),
});
export type EnergySettingsInput = z.infer<typeof energySettingsInputSchema>;

/** Grid kinds a Fluvius file contains. */
export const IMPORT_METER_KINDS = ["grid_import", "grid_export"] as const;

export const importedIntervalSchema = z
  .object({
    kind: z.enum(IMPORT_METER_KINDS),
    register: energyRegisterSchema,
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    energyWh: z.number().int().min(0).max(10_000_000),
    /** Gas: the measured volume in litres (m³ × 1000), when the file has it. */
    volumeLitres: z.number().int().min(0).max(100_000_000).optional().nullable(),
    /** Gas: gross calorific value used for `energyWh`, in Wh/m³. */
    calorificWhPerM3: z.number().int().min(5000).max(15_000).optional().nullable(),
    status: intervalStatusSchema,
  })
  .refine((interval) => Date.parse(interval.end) > Date.parse(interval.start), {
    message: "An interval must end after it starts",
    path: ["end"],
  });
export type ImportedInterval = z.infer<typeof importedIntervalSchema>;

/** Most intervals per request; the browser sends a file in batches of this size. */
export const IMPORT_BATCH_SIZE = 2000;

/** Body of `POST /api/energy/intervals/import`. Upserts, so overlapping files are safe. */
export const intervalImportSchema = z
  .object({
    source: z.literal("fluvius_csv"),
    /** Electricity (quarter-hours, four registers) or gas (hours, offtake only). */
    carrier: activeCarrierSchema.default("electricity"),
    ean: z.string().trim().max(40).optional().nullable(),
    intervals: z.array(importedIntervalSchema).min(1).max(IMPORT_BATCH_SIZE),
  })
  .refine((body) => body.carrier !== "gas" || body.intervals.every((interval) => interval.kind === "grid_import"), {
    message: "A gas file only has offtake",
    path: ["intervals"],
  });
export type IntervalImport = z.infer<typeof intervalImportSchema>;

export const summaryQuerySchema = z.object({
  period: energyPeriodSchema.default("month"),
  date: isoDateSchema,
  carrier: summaryViewSchema.default("electricity"),
});

// Read models ------------------------------------------------------------------------------------------------

export type AppliancePlace = {
  id: string;
  name: string;
  kind: "room" | "zone";
  color: string;
  icon: string | null;
  floorName: string;
};

export type Appliance = {
  id: string;
  name: string;
  category: ApplianceCategory;
  /** What it runs on; a gas boiler is gas + electricity (its pump). */
  carriers: EnergyCarrier[];
  placeId: string | null;
  place: AppliancePlace | null;
  ratedPowerW: number | null;
  standbyPowerW: number | null;
  notes: string | null;
  /** A meter (smart plug, sub-meter) measures this appliance. */
  measured: boolean;
};

export type SolarInstallation = {
  id: string;
  name: string;
  panelCount: number;
  panelWp: number;
  /** panelCount × panelWp, in kWp. */
  kwp: number;
  azimuthDeg: number | null;
  tiltDeg: number | null;
  inverterBrand: string | null;
  inverterModel: string | null;
  /** `YYYY-MM-DD` */
  installedOn: string | null;
};

export type HomeBattery = {
  id: string;
  name: string;
  capacityWh: number;
  maxChargeW: number | null;
  maxDischargeW: number | null;
  /** `YYYY-MM-DD` */
  installedOn: string | null;
};

export type EnergySettings = {
  gasEan: string | null;
  /** Calorific value for manual gas readings, kWh/m³. */
  gasCalorificKwhPerM3: number;
};

export type EnergySetup = {
  solarInstallations: SolarInstallation[];
  batteries: HomeBattery[];
  settings: EnergySettings;
};

export type EnergyMeter = {
  id: string;
  name: string;
  carrier: EnergyCarrier;
  kind: MeterKind;
  register: EnergyRegister;
  source: EnergySource;
  ean: string | null;
  applianceId: string | null;
  intervalCount: number;
  /** ISO timestamps of the first and last data, or null without data. */
  firstAt: string | null;
  lastAt: string | null;
};

export type MeterReading = {
  id: string;
  meterId: string;
  carrier: EnergyCarrier;
  kind: MeterKind;
  register: EnergyRegister;
  applianceName: string | null;
  /** ISO timestamp */
  readAt: string;
  valueWh: number;
  /** Gas: the register value in litres (m³ × 1000). */
  valueLitres: number | null;
};

export type EnergyDataOverview = {
  meters: EnergyMeter[];
  /** Most recent first. */
  readings: MeterReading[];
};

export type IntervalImportResult = {
  received: number;
  /** Rows written: `inserted` new ones plus `updated` ones that were already there (a re-import). */
  upserted: number;
  inserted: number;
  updated: number;
};

export type EnergyTotals = {
  importWh: number;
  importDayWh: number;
  importNightWh: number;
  exportWh: number;
  /** Null when not measured in this period. */
  solarWh: number | null;
  batteryChargeWh: number | null;
  batteryDischargeWh: number | null;
  /** C = import + solar + battery out − export − battery in. Null when solar or battery is installed but not measured. */
  consumptionWh: number | null;
  /** 1 − import / consumption, 0…1. */
  selfSufficiency: number | null;
  /** Share of solar production used at home, 0…1. */
  selfConsumption: number | null;
  /** Gas: volume in litres (m³ × 1000) where it was measured; null for electricity. */
  volumeLitres: number | null;
  /** Gas: average calorific value of the period, kWh/m³. */
  calorificKwhPerM3: number | null;
};

export type EnergySeriesPoint = {
  /** Local bucket label: `YYYY-MM-DDTHH:MM` (hour), `YYYY-MM-DD` (day) or `YYYY-MM` (month). */
  label: string;
  importWh: number;
  exportWh: number;
  solarWh: number | null;
  batteryChargeWh: number | null;
  batteryDischargeWh: number | null;
  consumptionWh: number | null;
  /** Gas volume in litres (gas view). */
  volumeLitres: number | null;
  /** Total view: electricity and gas consumption of the bucket. */
  electricityWh: number | null;
  gasWh: number | null;
};

export type ApplianceShare = {
  applianceId: string;
  name: string;
  category: ApplianceCategory;
  energyWh: number;
};

export type EnergyBreakdown = {
  /** Measured appliances, largest first. */
  appliances: ApplianceShare[];
  /** Consumption no appliance meter accounts for (≥ 0). Null when consumption is unknown. */
  unknownWh: number | null;
  /** Home consumption, the 100 % of the breakdown. */
  totalWh: number | null;
};

export type MonthlyPeak = {
  /** `YYYY-MM` */
  month: string;
  /** Highest 15-minute offtake in kW, null without quarter-hour data. */
  kw: number | null;
  /** ISO start of that quarter-hour. */
  at: string | null;
};

export type EnergyPeak = MonthlyPeak & {
  /** What the capacity tariff bills: at least `CAPACITY_MINIMUM_KW`. */
  billedKw: number;
  /** The 12 months up to and including `month`, oldest first. */
  history: MonthlyPeak[];
  /** Average of the billed monthly peaks over the months with data. */
  rollingAverageKw: number | null;
};

export type EnergySummary = {
  /** Which carrier the totals, series and breakdown are for (`total` = electricity + gas in kWh). */
  carrier: SummaryView;
  period: EnergyPeriod;
  /** First day of the period and first day after it, `YYYY-MM-DD`. */
  from: string;
  to: string;
  totals: EnergyTotals;
  series: EnergySeriesPoint[];
  breakdown: EnergyBreakdown;
  /** The capacity-tariff peak. Electricity only, so it is the same in every view. */
  peak: EnergyPeak;
  /** What is set up and what has data, for empty states and honest notices. */
  status: {
    /** The view's carrier has meter data (grid or gas meter) in this period. */
    hasGridData: boolean;
    /** Electricity and gas data in this period, whatever the view. */
    hasElectricityData: boolean;
    hasGasData: boolean;
    hasSolar: boolean;
    hasBattery: boolean;
    solarMeasured: boolean;
    batteryMeasured: boolean;
    applianceCount: number;
  };
};

/**
 * What the dashboard gets: this period's electricity summary (as before) plus the gas summary, `null` when
 * the gas request failed (the electricity figures still show).
 */
export type CurrentEnergySummary = EnergySummary & { gas: EnergySummary | null };

// Helpers shared by the API and the UI ---------------------------------------------------------------------

export const solarKwp = (installation: Pick<SolarInstallation, "panelCount" | "panelWp">) =>
  Math.round(installation.panelCount * installation.panelWp) / 1000;

export const COMPASS_POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Nearest of the eight compass points for an azimuth (0 = north, 180 = south). */
export const compassPoint = (azimuthDeg: number): CompassPoint =>
  COMPASS_POINTS[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8] ?? "s";

/** Adults and owners manage energy data; children can only look. Mirrors the API's role check. */
export const canManageEnergy = (role: "owner" | "adult" | "child") => role !== "child";
