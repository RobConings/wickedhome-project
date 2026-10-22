import {
  CAPACITY_MINIMUM_KW,
  DEFAULT_GAS_CALORIFIC_KWH_PER_M3,
  solarKwp,
  type ActiveCarrier,
  type Appliance,
  type ApplianceCategory,
  type ApplianceInput,
  type ApplianceShare,
  type BatteryInput,
  type EnergyDataOverview,
  type EnergyRegister,
  type EnergySeriesPoint,
  type EnergyCarrier,
  type EnergySettings,
  type EnergySettingsInput,
  type EnergySetup,
  type EnergySource,
  type EnergySummary,
  type HomeBattery,
  type IntervalImport,
  type IntervalImportResult,
  type MeterKind,
  type MeterReading,
  type MeterReadingInput,
  type MonthlyPeak,
  type SolarInstallation,
  type SolarInstallationInput,
  type SummaryView,
} from "@/features/energy/types/energy";
import { bucketLabels, periodRange, type EnergyPeriod } from "@/features/energy/types/energy-period";
import { zonedMidnight } from "@/features/energy/types/energy-time";
import { HOUSEHOLD_TIME_ZONE, addDays, addMonthsClamped, todayIn } from "@/types/dates";
import { forgetDocumentLinks } from "../documents/documents.service";
import {
  db,
  type ApplianceCategory as ApplianceCategoryRow,
  type EnergyCarrier as CarrierRow,
  type EnergyMeterKind as MeterKindRow,
  type EnergyRegister as RegisterRow,
  type EnergySource as SourceRow,
  type HomeBattery as HomeBatteryRow,
  type SolarInstallation as SolarInstallationRow,
} from "../lib/db";
import { badRequest, notFound } from "../lib/http";

// Mapping between contract enums (lowercase) and Prisma enums (UPPERCASE) ------------------------------------

const lower = <T extends string>(value: string) => value.toLowerCase() as T;
const toCategory = (value: ApplianceCategoryRow) => lower<ApplianceCategory>(value);
const fromCategory = (value: ApplianceCategory) => value.toUpperCase() as ApplianceCategoryRow;
const toKind = (value: MeterKindRow) => lower<MeterKind>(value);
const fromKind = (value: MeterKind) => value.toUpperCase() as MeterKindRow;
const toRegister = (value: RegisterRow) => lower<EnergyRegister>(value);
const fromRegister = (value: EnergyRegister) => value.toUpperCase() as RegisterRow;
const toSource = (value: SourceRow) => lower<EnergySource>(value);
const toCarrier = (value: CarrierRow) => lower<EnergyCarrier>(value);
const fromCarrier = (value: EnergyCarrier) => value.toUpperCase() as CarrierRow;

const toDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00Z`) : null);
const fromDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

// Appliances ---------------------------------------------------------------------------------------------------

const applianceInclude = {
  place: { select: { id: true, name: true, kind: true, color: true, icon: true, floor: { select: { name: true } } } },
  _count: { select: { meters: true } },
} as const;

type ApplianceRowWithPlace = NonNullable<Awaited<ReturnType<typeof findOwnAppliance>>>;

function toAppliance(row: ApplianceRowWithPlace): Appliance {
  return {
    id: row.id,
    name: row.name,
    category: toCategory(row.category),
    carriers: row.carriers.map(toCarrier),
    placeId: row.placeId,
    place: row.place && {
      id: row.place.id,
      name: row.place.name,
      kind: lower<"room" | "zone">(row.place.kind),
      color: row.place.color,
      icon: row.place.icon,
      floorName: row.place.floor.name,
    },
    ratedPowerW: row.ratedPowerW,
    standbyPowerW: row.standbyPowerW,
    notes: row.notes,
    measured: row._count.meters > 0,
  };
}

async function findOwnAppliance(householdId: string, id: string) {
  const row = await db.appliance.findFirst({ where: { id, householdId }, include: applianceInclude });
  if (!row) throw notFound("Appliance not found");
  return row;
}

async function applianceData(householdId: string, input: ApplianceInput) {
  if (input.placeId) {
    const place = await db.place.findFirst({ where: { id: input.placeId, householdId }, select: { id: true } });
    if (!place) throw badRequest("Validation failed", { placeId: ["Unknown place"] });
  }
  return {
    name: input.name,
    category: fromCategory(input.category),
    carriers: input.carriers.map(fromCarrier),
    placeId: input.placeId || null,
    ratedPowerW: input.ratedPowerW ?? null,
    standbyPowerW: input.standbyPowerW ?? null,
    notes: input.notes || null,
  };
}

export async function listAppliances(householdId: string): Promise<Appliance[]> {
  const rows = await db.appliance.findMany({ where: { householdId }, include: applianceInclude, orderBy: { name: "asc" } });
  return rows.map(toAppliance);
}

export async function createAppliance(householdId: string, input: ApplianceInput): Promise<Appliance> {
  const row = await db.appliance.create({
    data: { householdId, ...(await applianceData(householdId, input)) },
    include: applianceInclude,
  });
  return toAppliance(row);
}

export async function updateAppliance(householdId: string, id: string, input: ApplianceInput): Promise<Appliance> {
  await findOwnAppliance(householdId, id);
  const row = await db.appliance.update({
    where: { id },
    data: await applianceData(householdId, input),
    include: applianceInclude,
  });
  return toAppliance(row);
}

/** Deleting an appliance also deletes its meters and their data. */
export async function deleteAppliance(householdId: string, id: string): Promise<void> {
  await findOwnAppliance(householdId, id);
  await db.appliance.delete({ where: { id } });
  await forgetDocumentLinks("appliance", id);
}

// Solar installations and batteries ------------------------------------------------------------------------------

function toSolar(row: SolarInstallationRow): SolarInstallation {
  return {
    id: row.id,
    name: row.name,
    panelCount: row.panelCount,
    panelWp: row.panelWp,
    kwp: solarKwp(row),
    azimuthDeg: row.azimuthDeg,
    tiltDeg: row.tiltDeg,
    inverterBrand: row.inverterBrand,
    inverterModel: row.inverterModel,
    installedOn: fromDate(row.installedOn),
  };
}

const solarData = (input: SolarInstallationInput) => ({
  name: input.name,
  panelCount: input.panelCount,
  panelWp: input.panelWp,
  azimuthDeg: input.azimuthDeg ?? null,
  tiltDeg: input.tiltDeg ?? null,
  inverterBrand: input.inverterBrand || null,
  inverterModel: input.inverterModel || null,
  installedOn: toDate(input.installedOn),
});

function toBattery(row: HomeBatteryRow): HomeBattery {
  return {
    id: row.id,
    name: row.name,
    capacityWh: row.capacityWh,
    maxChargeW: row.maxChargeW,
    maxDischargeW: row.maxDischargeW,
    installedOn: fromDate(row.installedOn),
  };
}

const batteryData = (input: BatteryInput) => ({
  name: input.name,
  capacityWh: input.capacityWh,
  maxChargeW: input.maxChargeW ?? null,
  maxDischargeW: input.maxDischargeW ?? null,
  installedOn: toDate(input.installedOn),
});

const DEFAULT_CALORIFIC_WH_PER_M3 = Math.round(DEFAULT_GAS_CALORIFIC_KWH_PER_M3 * 1000);

async function findSettings(householdId: string) {
  return db.energySettings.findUnique({ where: { householdId } });
}

const toSettings = (row: Awaited<ReturnType<typeof findSettings>>): EnergySettings => ({
  gasEan: row?.gasEan ?? null,
  gasCalorificKwhPerM3: (row?.gasCalorificWhPerM3 ?? DEFAULT_CALORIFIC_WH_PER_M3) / 1000,
});

export async function getEnergySetup(householdId: string): Promise<EnergySetup> {
  const [solar, batteries, settings] = await Promise.all([
    db.solarInstallation.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    db.homeBattery.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    findSettings(householdId),
  ]);
  return { solarInstallations: solar.map(toSolar), batteries: batteries.map(toBattery), settings: toSettings(settings) };
}

export async function saveEnergySettings(householdId: string, input: EnergySettingsInput): Promise<EnergySettings> {
  const data = { gasEan: input.gasEan || null, gasCalorificWhPerM3: input.gasCalorificWhPerM3 };
  return toSettings(
    await db.energySettings.upsert({ where: { householdId }, create: { householdId, ...data }, update: data }),
  );
}

export async function createSolarInstallation(householdId: string, input: SolarInstallationInput) {
  return toSolar(await db.solarInstallation.create({ data: { householdId, ...solarData(input) } }));
}

async function assertOwnSolar(householdId: string, id: string) {
  const row = await db.solarInstallation.findFirst({ where: { id, householdId }, select: { id: true } });
  if (!row) throw notFound("Solar installation not found");
}

export async function updateSolarInstallation(householdId: string, id: string, input: SolarInstallationInput) {
  await assertOwnSolar(householdId, id);
  return toSolar(await db.solarInstallation.update({ where: { id }, data: solarData(input) }));
}

export async function deleteSolarInstallation(householdId: string, id: string): Promise<void> {
  await assertOwnSolar(householdId, id);
  await db.solarInstallation.delete({ where: { id } });
}

export async function createBattery(householdId: string, input: BatteryInput) {
  return toBattery(await db.homeBattery.create({ data: { householdId, ...batteryData(input) } }));
}

async function assertOwnBattery(householdId: string, id: string) {
  const row = await db.homeBattery.findFirst({ where: { id, householdId }, select: { id: true } });
  if (!row) throw notFound("Battery not found");
}

export async function updateBattery(householdId: string, id: string, input: BatteryInput) {
  await assertOwnBattery(householdId, id);
  return toBattery(await db.homeBattery.update({ where: { id }, data: batteryData(input) }));
}

export async function deleteBattery(householdId: string, id: string): Promise<void> {
  await assertOwnBattery(householdId, id);
  await db.homeBattery.delete({ where: { id } });
}

// Meters, imports and readings --------------------------------------------------------------------------------

type MeterKey = {
  carrier: ActiveCarrier;
  kind: MeterKind;
  register: EnergyRegister;
  source: SourceRow;
  ean?: string | null;
  applianceId?: string | null;
};

/** The meter for a kind + register + source (+ EAN / appliance), created on first use. */
async function findOrCreateMeter(householdId: string, key: MeterKey): Promise<string> {
  const where = {
    householdId,
    carrier: fromCarrier(key.carrier),
    kind: fromKind(key.kind),
    register: fromRegister(key.register),
    source: key.source,
    applianceId: key.applianceId ?? null,
    ...(key.ean !== undefined && { ean: key.ean }),
  };
  const existing = await db.energyMeter.findFirst({ where, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.energyMeter.create({
    data: {
      ...where,
      ean: key.ean ?? null,
      name: `${key.source.toLowerCase()} ${key.carrier} ${key.kind} ${key.register}`,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Upserts a batch of parsed Fluvius intervals (electricity or gas). One meter per carrier, register and
 * EAN; a re-import of an overlapping file replaces values instead of doubling them.
 */
export async function importIntervals(householdId: string, input: IntervalImport): Promise<IntervalImportResult> {
  const meterIds = new Map<string, string>();
  for (const interval of input.intervals) {
    const key = `${interval.kind}:${interval.register}`;
    if (!meterIds.has(key)) {
      meterIds.set(
        key,
        await findOrCreateMeter(householdId, {
          carrier: input.carrier,
          kind: interval.kind,
          register: interval.register,
          source: "FLUVIUS_CSV",
          ean: input.ean || null,
        }),
      );
    }
  }

  // Postgres refuses to update the same row twice in one statement: keep the last row per key.
  type Row = {
    meterId: string;
    start: string;
    end: string;
    wh: number;
    litres: number | null;
    calorific: number | null;
    status: string;
  };
  const rows = new Map<string, Row>();
  for (const interval of input.intervals) {
    const meterId = meterIds.get(`${interval.kind}:${interval.register}`) ?? "";
    rows.set(`${meterId}|${interval.start}|${interval.end}`, {
      meterId,
      start: interval.start,
      end: interval.end,
      wh: interval.energyWh,
      litres: interval.volumeLitres ?? null,
      calorific: interval.calorificWhPerM3 ?? null,
      status: interval.status.toUpperCase(),
    });
  }
  const values = [...rows.values()];

  // `xmax = 0` is true for a freshly inserted row and false for one the conflict clause updated.
  const written = await db.$queryRaw<{ inserted: boolean }[]>`
    INSERT INTO energy_intervals ("meterId", "startAt", "endAt", "energyWh", "volumeLitres", "calorificWhPerM3", "status")
    SELECT * FROM unnest(
      ${values.map((row) => row.meterId)}::text[],
      ${values.map((row) => row.start)}::timestamptz[],
      ${values.map((row) => row.end)}::timestamptz[],
      ${values.map((row) => row.wh)}::int[],
      ${values.map((row) => row.litres)}::int[],
      ${values.map((row) => row.calorific)}::int[],
      ${values.map((row) => row.status)}::text[]::"EnergyIntervalStatus"[]
    )
    ON CONFLICT ("meterId", "startAt", "endAt")
    DO UPDATE SET "energyWh" = EXCLUDED."energyWh", "volumeLitres" = EXCLUDED."volumeLitres",
                  "calorificWhPerM3" = EXCLUDED."calorificWhPerM3", "status" = EXCLUDED."status"
    RETURNING (xmax = 0) AS inserted`;

  const inserted = written.filter((row) => row.inserted).length;
  return { received: input.intervals.length, upserted: written.length, inserted, updated: written.length - inserted };
}

/** Rebuilds a manual meter's intervals from its readings: one interval between each pair of readings. */
async function rebuildReadingIntervals(meterId: string): Promise<void> {
  const readings = await db.energyMeterReading.findMany({ where: { meterId }, orderBy: { readAt: "asc" } });
  const data = readings.slice(1).flatMap((reading, index) => {
    const previous = readings[index];
    // A lower value means the meter was replaced or reset: no interval across it.
    if (!previous || reading.valueWh < previous.valueWh) return [];
    return [
      {
        meterId,
        startAt: previous.readAt,
        endAt: reading.readAt,
        energyWh: reading.valueWh - previous.valueWh,
        volumeLitres:
          reading.valueLitres !== null && previous.valueLitres !== null ? reading.valueLitres - previous.valueLitres : null,
        calorificWhPerM3: reading.calorificWhPerM3,
        status: "MEASURED" as const,
      },
    ];
  });
  await db.$transaction([db.energyInterval.deleteMany({ where: { meterId } }), db.energyInterval.createMany({ data })]);
}

/**
 * Saves a manual reading. Gas readings are in m³ (litres) and converted to Wh with the household's calorific
 * value at the time of the reading; both are kept.
 */
export async function createReading(householdId: string, input: MeterReadingInput): Promise<void> {
  if (input.applianceId) await findOwnAppliance(householdId, input.applianceId);
  const gas = input.carrier === "gas";
  const meterId = await findOrCreateMeter(householdId, {
    carrier: input.carrier,
    kind: input.kind,
    register: input.kind === "appliance" || gas ? "single" : input.register,
    source: "MANUAL",
    applianceId: input.kind === "appliance" ? input.applianceId : null,
  });
  const calorificWhPerM3 = gas
    ? ((await findSettings(householdId))?.gasCalorificWhPerM3 ?? DEFAULT_CALORIFIC_WH_PER_M3)
    : null;
  const valueLitres = gas ? (input.valueLitres ?? 0) : null;
  const valueWh = gas ? Math.round(((valueLitres ?? 0) / 1000) * (calorificWhPerM3 ?? 0)) : (input.valueWh ?? 0);
  const readAt = new Date(input.readAt);
  const data = { valueWh, valueLitres, calorificWhPerM3 };
  await db.energyMeterReading.upsert({
    where: { meterId_readAt: { meterId, readAt } },
    create: { meterId, readAt, ...data },
    update: data,
  });
  await rebuildReadingIntervals(meterId);
}

export async function deleteReading(householdId: string, id: string): Promise<void> {
  const reading = await db.energyMeterReading.findFirst({ where: { id, meter: { householdId } } });
  if (!reading) throw notFound("Reading not found");
  await db.energyMeterReading.delete({ where: { id } });
  await rebuildReadingIntervals(reading.meterId);
}

export async function getEnergyData(householdId: string): Promise<EnergyDataOverview> {
  const [meters, stats, readings] = await Promise.all([
    db.energyMeter.findMany({
      where: { householdId },
      orderBy: [{ carrier: "asc" }, { kind: "asc" }, { register: "asc" }],
    }),
    db.energyInterval.groupBy({
      by: ["meterId"],
      where: { meter: { householdId } },
      _count: { _all: true },
      _min: { startAt: true },
      _max: { endAt: true },
    }),
    db.energyMeterReading.findMany({
      where: { meter: { householdId } },
      include: { meter: { include: { appliance: { select: { name: true } } } } },
      orderBy: { readAt: "desc" },
      take: 20,
    }),
  ]);
  const statsByMeter = new Map(stats.map((stat) => [stat.meterId, stat]));

  return {
    meters: meters.map((meter) => {
      const stat = statsByMeter.get(meter.id);
      return {
        id: meter.id,
        name: meter.name,
        carrier: toCarrier(meter.carrier),
        kind: toKind(meter.kind),
        register: toRegister(meter.register),
        source: toSource(meter.source),
        ean: meter.ean,
        applianceId: meter.applianceId,
        intervalCount: stat?._count._all ?? 0,
        firstAt: stat?._min.startAt?.toISOString() ?? null,
        lastAt: stat?._max.endAt?.toISOString() ?? null,
      };
    }),
    readings: readings.map(
      (reading): MeterReading => ({
        id: reading.id,
        meterId: reading.meterId,
        carrier: toCarrier(reading.meter.carrier),
        kind: toKind(reading.meter.kind),
        register: toRegister(reading.meter.register),
        applianceName: reading.meter.appliance?.name ?? null,
        readAt: reading.readAt.toISOString(),
        valueWh: reading.valueWh,
        valueLitres: reading.valueLitres,
      }),
    ),
  };
}

// Summary ------------------------------------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<SourceRow, number> = { HOME_ASSISTANT: 3, FLUVIUS_CSV: 2, MANUAL: 1 };
const STEP: Record<EnergyPeriod, string> = { day: "1 hour", week: "1 day", month: "1 day", year: "1 month" };
const LABEL_FORMAT: Record<EnergyPeriod, string> = {
  day: 'YYYY-MM-DD"T"HH24:MI',
  week: "YYYY-MM-DD",
  month: "YYYY-MM-DD",
  year: "YYYY-MM",
};

/**
 * Keeps, per bucket and per carrier + kind (per appliance for appliance meters), only the rows of the best
 * source with data in that bucket: Home Assistant over Fluvius over manual readings. So two sources never add
 * up, and readings still fill the months a Fluvius file doesn't cover.
 */
function preferBestSource(rows: BucketRow[]): BucketRow[] {
  const groupOf = (row: BucketRow) =>
    `${row.label}|${row.carrier}|${row.kind === "APPLIANCE" ? `APPLIANCE:${row.applianceId}` : row.kind}`;
  const best = new Map<string, number>();
  for (const row of rows) best.set(groupOf(row), Math.max(best.get(groupOf(row)) ?? 0, SOURCE_PRIORITY[row.source]));
  return rows.filter((row) => SOURCE_PRIORITY[row.source] === best.get(groupOf(row)));
}

type BucketRow = {
  label: string;
  source: SourceRow;
  carrier: CarrierRow;
  kind: MeterKindRow;
  register: RegisterRow;
  applianceId: string | null;
  wh: number;
  litres: number | null;
  whWithVolume: number | null;
};
type PeakRow = { month: string; startAt: Date; wh: number };

const round2 = (value: number) => Math.round(value * 100) / 100;
const ratio = (value: number, total: number) => (total > 0 ? Math.min(1, Math.max(0, value / total)) : null);

/** Highest quarter-hour electricity offtake per month, for the 12 months ending with `month` (`YYYY-MM`). */
async function monthlyPeaks(householdId: string, month: string): Promise<MonthlyPeak[]> {
  const monthStart = `${month}-01`;
  const months = Array.from({ length: 12 }, (_, index) => addMonthsClamped(monthStart, index - 11).slice(0, 7));
  const rows = await db.$queryRaw<PeakRow[]>`
    SELECT DISTINCT ON (month) month, "startAt", wh
    FROM (
      SELECT to_char(i."startAt" AT TIME ZONE ${HOUSEHOLD_TIME_ZONE}, 'YYYY-MM') AS month,
             i."startAt" AS "startAt",
             SUM(i."energyWh")::int AS wh
      FROM energy_intervals i
      JOIN energy_meters m ON m.id = i."meterId"
      WHERE m."householdId" = ${householdId}
        AND m.carrier = 'ELECTRICITY'
        AND m.kind = 'GRID_IMPORT'
        AND i."endAt" - i."startAt" = interval '15 minutes'
        AND i."startAt" >= ${zonedMidnight(addMonthsClamped(monthStart, -11))}
        AND i."startAt" < ${zonedMidnight(addMonthsClamped(monthStart, 1))}
      -- Per source, so two sources for the same quarter-hour never add up.
      GROUP BY 1, m.source, i."startAt"
    ) quarters
    ORDER BY month, wh DESC, "startAt"`;
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return months.map((value) => {
    const row = byMonth.get(value);
    return { month: value, kw: row ? round2((row.wh * 4) / 1000) : null, at: row?.startAt.toISOString() ?? null };
  });
}

type Sums = {
  import: number;
  importDay: number;
  importNight: number;
  export: number;
  solar: number;
  charge: number;
  discharge: number;
  /** Gas volume in litres, and the energy of the intervals that have a volume (for the calorific average). */
  litres: number;
  whWithVolume: number;
};
const emptySums = (): Sums => ({
  import: 0,
  importDay: 0,
  importNight: 0,
  export: 0,
  solar: 0,
  charge: 0,
  discharge: 0,
  litres: 0,
  whWithVolume: 0,
});

/** One carrier's data in the period: per bucket, in total and per measured appliance. */
type CarrierData = {
  buckets: Map<string, Sums>;
  totals: Sums;
  perAppliance: Map<string, number>;
  hasGridData: boolean;
  hasVolume: boolean;
  /** Whether consumption can be computed; per bucket with `consumption()`. */
  consumptionKnown: boolean;
  consumption: (sums: Sums) => number | null;
};

function collect(rows: BucketRow[], labels: string[]): Omit<CarrierData, "consumptionKnown" | "consumption" | "hasGridData"> {
  const buckets = new Map(labels.map((label) => [label, emptySums()]));
  const totals = emptySums();
  const perAppliance = new Map<string, number>();
  let hasVolume = false;
  for (const row of rows) {
    const bucket = buckets.get(row.label);
    const wh = Number(row.wh) || 0;
    if (row.litres !== null) hasVolume = true;
    for (const sums of bucket ? [bucket, totals] : [totals]) {
      if (row.kind === "GRID_IMPORT") {
        sums.import += wh;
        if (row.register === "DAY") sums.importDay += wh;
        if (row.register === "NIGHT") sums.importNight += wh;
        sums.litres += Number(row.litres) || 0;
        sums.whWithVolume += Number(row.whWithVolume) || 0;
      } else if (row.kind === "GRID_EXPORT") sums.export += wh;
      else if (row.kind === "SOLAR_PRODUCTION") sums.solar += wh;
      else if (row.kind === "BATTERY_CHARGE") sums.charge += wh;
      else if (row.kind === "BATTERY_DISCHARGE") sums.discharge += wh;
    }
    if (row.kind === "APPLIANCE" && row.applianceId) {
      perAppliance.set(row.applianceId, (perAppliance.get(row.applianceId) ?? 0) + wh);
    }
  }
  return { buckets, totals, perAppliance, hasVolume };
}

/**
 * Totals, time series, appliance breakdown and capacity peak for one period and view: electricity, gas, or
 * total energy (both in kWh). The capacity peak is always the electricity peak.
 */
export async function getEnergySummary(
  householdId: string,
  period: EnergyPeriod,
  date: string,
  view: SummaryView = "electricity",
): Promise<EnergySummary> {
  const { from, to } = periodRange(period, date);
  const start = zonedMidnight(from);
  const end = zonedMidnight(to);

  const [meterRows, solar, batteries, applianceCount] = await Promise.all([
    db.energyMeter.findMany({
      where: {
        householdId,
        carrier: { in: ["ELECTRICITY", "GAS"] },
        intervals: { some: { startAt: { lt: end }, endAt: { gt: start } } },
      },
      select: {
        id: true,
        carrier: true,
        kind: true,
        source: true,
        applianceId: true,
        appliance: { select: { name: true, category: true } },
      },
    }),
    db.solarInstallation.findMany({ where: { householdId }, select: { installedOn: true } }),
    db.homeBattery.findMany({ where: { householdId }, select: { installedOn: true } }),
    db.appliance.count({ where: { householdId } }),
  ]);
  const meters = meterRows;
  const installedBy = (rows: { installedOn: Date | null }[]) =>
    rows.some((row) => !row.installedOn || (fromDate(row.installedOn) ?? "") < to);
  const hasSolar = installedBy(solar);
  const hasBattery = installedBy(batteries);
  const has = (carrier: CarrierRow, kind: MeterKindRow) =>
    meters.some((meter) => meter.carrier === carrier && meter.kind === kind);
  const solarMeasured = has("ELECTRICITY", "SOLAR_PRODUCTION");
  const batteryMeasured = has("ELECTRICITY", "BATTERY_CHARGE") || has("ELECTRICITY", "BATTERY_DISCHARGE");

  // Prorate every interval over the local buckets it overlaps (manual readings span days or weeks).
  const step = STEP[period];
  const rows =
    meters.length === 0
      ? []
      : await db.$queryRaw<BucketRow[]>`
          WITH buckets AS (
            SELECT to_char(local_start, ${LABEL_FORMAT[period]}) AS label,
                   local_start AT TIME ZONE ${HOUSEHOLD_TIME_ZONE} AS start_at,
                   (local_start + ${step}::interval) AT TIME ZONE ${HOUSEHOLD_TIME_ZONE} AS end_at
            FROM generate_series(${from}::timestamp, ${to}::timestamp - ${step}::interval, ${step}::interval) AS local_start
          ),
          parts AS (
            SELECT b.label, m.source, m.carrier, m.kind, m.register, m."applianceId", i."energyWh", i."volumeLitres",
                   EXTRACT(EPOCH FROM LEAST(i."endAt", b.end_at) - GREATEST(i."startAt", b.start_at))
                     / NULLIF(EXTRACT(EPOCH FROM i."endAt" - i."startAt"), 0) AS share
            FROM buckets b
            JOIN energy_intervals i ON i."startAt" < b.end_at AND i."endAt" > b.start_at
            JOIN energy_meters m ON m.id = i."meterId"
            WHERE i."meterId" = ANY(${meters.map((meter) => meter.id)}::text[])
          )
          SELECT label, source, carrier, kind, register, "applianceId",
                 SUM("energyWh" * share)::float8 AS wh,
                 SUM("volumeLitres" * share)::float8 AS litres,
                 SUM(CASE WHEN "volumeLitres" IS NOT NULL THEN "energyWh" * share END)::float8 AS "whWithVolume"
          FROM parts
          GROUP BY label, source, carrier, kind, register, "applianceId"`;

  const labels = bucketLabels(period, date);
  const bestRows = preferBestSource(rows);
  const elecRows = bestRows.filter((row) => row.carrier === "ELECTRICITY");
  const gasRows = bestRows.filter((row) => row.carrier === "GAS");

  const elecHasGrid = has("ELECTRICITY", "GRID_IMPORT") || has("ELECTRICITY", "GRID_EXPORT");
  const elecKnown = elecHasGrid && (!hasSolar || solarMeasured) && (!hasBattery || batteryMeasured);
  const electricity: CarrierData = {
    ...collect(elecRows, labels),
    hasGridData: elecHasGrid,
    consumptionKnown: elecKnown,
    consumption: (sums) =>
      elecKnown ? Math.max(0, sums.import + sums.solar + sums.discharge - sums.export - sums.charge) : null,
  };
  const gasHasGrid = has("GAS", "GRID_IMPORT");
  const gas: CarrierData = {
    ...collect(gasRows, labels),
    hasGridData: gasHasGrid,
    consumptionKnown: gasHasGrid,
    consumption: (sums) => (gasHasGrid ? sums.import : null),
  };

  const bucketOf = (data: CarrierData, label: string) => data.buckets.get(label) ?? emptySums();
  const nullable = (value: number | null) => (value === null ? null : Math.round(value));
  /** Total energy: the carriers with data add up; one with data but unknown consumption makes it unknown. */
  const totalOf = (elec: number | null, gasWh: number | null) => {
    if ((electricity.hasGridData && elec === null) || (gas.hasGridData && gasWh === null)) return null;
    if (!electricity.hasGridData && !gas.hasGridData) return null;
    return (elec ?? 0) + (gasWh ?? 0);
  };
  const orNull = (measured: boolean, value: number) => (measured ? Math.round(value) : null);

  const series: EnergySeriesPoint[] = labels.map((label) => {
    const e = bucketOf(electricity, label);
    const g = bucketOf(gas, label);
    const elecWh = electricity.consumption(e);
    const gasWh = gas.consumption(g);
    if (view === "gas") {
      return {
        label,
        importWh: Math.round(g.import),
        exportWh: 0,
        solarWh: null,
        batteryChargeWh: null,
        batteryDischargeWh: null,
        consumptionWh: nullable(gasWh),
        volumeLitres: gas.hasVolume ? Math.round(g.litres) : null,
        electricityWh: null,
        gasWh: nullable(gasWh),
      };
    }
    const total = view === "total";
    return {
      label,
      importWh: Math.round(e.import + (total ? g.import : 0)),
      exportWh: Math.round(e.export),
      solarWh: orNull(solarMeasured, e.solar),
      batteryChargeWh: orNull(batteryMeasured, e.charge),
      batteryDischargeWh: orNull(batteryMeasured, e.discharge),
      consumptionWh: nullable(total ? totalOf(elecWh, gasWh) : elecWh),
      volumeLitres: null,
      electricityWh: nullable(elecWh),
      gasWh: total ? nullable(gasWh) : null,
    };
  });

  // Appliance names for every measured appliance meter.
  const applianceInfo = new Map(meters.flatMap((meter) => (meter.appliance ? [[meter.applianceId, meter.appliance]] : [])));
  const perAppliance =
    view === "electricity"
      ? electricity.perAppliance
      : view === "gas"
        ? gas.perAppliance
        : new Map(
            [...new Set([...electricity.perAppliance.keys(), ...gas.perAppliance.keys()])].map((id) => [
              id,
              (electricity.perAppliance.get(id) ?? 0) + (gas.perAppliance.get(id) ?? 0),
            ]),
          );
  const appliances: ApplianceShare[] = [...perAppliance.entries()]
    .map(([applianceId, wh]) => {
      const info = applianceInfo.get(applianceId);
      return {
        applianceId,
        name: info?.name ?? "?",
        category: info ? toCategory(info.category) : "other",
        energyWh: Math.round(wh),
      };
    })
    .sort((a, b) => b.energyWh - a.energyWh);
  const measuredTotal = appliances.reduce((sum, appliance) => sum + appliance.energyWh, 0);

  const elecTotal = electricity.consumption(electricity.totals);
  const gasTotal = gas.consumption(gas.totals);
  const consumption = nullable(view === "electricity" ? elecTotal : view === "gas" ? gasTotal : totalOf(elecTotal, gasTotal));

  // The capacity peak belongs to a month: the period's last month, but never one in the future.
  const anchor = [addDays(to, -1), todayIn()].sort()[0] ?? from;
  const history = await monthlyPeaks(householdId, anchor.slice(0, 7));
  const current = history[history.length - 1] ?? { month: anchor.slice(0, 7), kw: null, at: null };
  const billed = history.flatMap((peak) => (peak.kw === null ? [] : [Math.max(CAPACITY_MINIMUM_KW, peak.kw)]));

  const e = electricity.totals;
  const g = gas.totals;
  const totals: EnergySummary["totals"] =
    view === "gas"
      ? {
          importWh: Math.round(g.import),
          importDayWh: 0,
          importNightWh: 0,
          exportWh: 0,
          solarWh: null,
          batteryChargeWh: null,
          batteryDischargeWh: null,
          consumptionWh: consumption,
          selfSufficiency: null,
          selfConsumption: null,
          volumeLitres: gas.hasVolume ? Math.round(g.litres) : null,
          calorificKwhPerM3: g.litres > 0 ? round2(g.whWithVolume / g.litres) : null,
        }
      : {
          importWh: Math.round(e.import + (view === "total" ? g.import : 0)),
          importDayWh: Math.round(e.importDay),
          importNightWh: Math.round(e.importNight),
          exportWh: Math.round(e.export),
          solarWh: orNull(solarMeasured, e.solar),
          batteryChargeWh: orNull(batteryMeasured, e.charge),
          batteryDischargeWh: orNull(batteryMeasured, e.discharge),
          consumptionWh: consumption,
          // Self-sufficiency is an electricity figure; it means little with gas mixed in.
          selfSufficiency: view === "electricity" && elecTotal !== null ? ratio(elecTotal - e.import, elecTotal) : null,
          selfConsumption: solarMeasured ? ratio(e.solar - e.export, e.solar) : null,
          volumeLitres: null,
          calorificKwhPerM3: null,
        };

  return {
    carrier: view,
    period,
    from,
    to,
    totals,
    series,
    breakdown: {
      appliances,
      unknownWh: consumption === null ? null : Math.max(0, consumption - measuredTotal),
      totalWh: consumption,
    },
    peak: {
      ...current,
      billedKw: Math.max(CAPACITY_MINIMUM_KW, current.kw ?? 0),
      history,
      rollingAverageKw: billed.length ? round2(billed.reduce((sum, kw) => sum + kw, 0) / billed.length) : null,
    },
    status: {
      hasGridData: view === "electricity" ? elecHasGrid : view === "gas" ? gasHasGrid : elecHasGrid || gasHasGrid,
      hasElectricityData: elecHasGrid,
      hasGasData: gasHasGrid,
      hasSolar,
      hasBattery,
      solarMeasured,
      batteryMeasured,
      applianceCount,
    },
  };
}

// Home Assistant statistics (imported by src/api/home-assistant/ha-energy.ts) ----------------------------------

/** One statistic from Home Assistant's energy preferences, as a meter (source HOME_ASSISTANT). */
export type HomeAssistantMeterSpec = {
  statisticId: string;
  carrier: ActiveCarrier;
  kind: MeterKind;
  register: EnergyRegister;
  applianceId?: string | null;
};

export type HomeAssistantMeter = {
  id: string;
  statisticId: string;
  carrier: ActiveCarrier;
  kind: MeterKind;
  register: EnergyRegister;
  applianceId: string | null;
  intervalCount: number;
  lastAt: Date | null;
};

/** The household's Home Assistant meters (one per statistic) with how much data each holds. */
export async function listHomeAssistantMeters(householdId: string): Promise<HomeAssistantMeter[]> {
  const meters = await db.energyMeter.findMany({
    where: { householdId, source: "HOME_ASSISTANT", haStatisticId: { not: null } },
    orderBy: [{ kind: "asc" }, { haStatisticId: "asc" }],
  });
  const stats = meters.length
    ? await db.energyInterval.groupBy({
        by: ["meterId"],
        where: { meterId: { in: meters.map((meter) => meter.id) } },
        _count: { _all: true },
        _max: { endAt: true },
      })
    : [];
  const byMeter = new Map(stats.map((stat) => [stat.meterId, stat]));
  return meters.map((meter) => ({
    id: meter.id,
    statisticId: meter.haStatisticId ?? "",
    carrier: toCarrier(meter.carrier) as ActiveCarrier,
    kind: toKind(meter.kind),
    register: toRegister(meter.register),
    applianceId: meter.applianceId,
    intervalCount: byMeter.get(meter.id)?._count._all ?? 0,
    lastAt: byMeter.get(meter.id)?._max.endAt ?? null,
  }));
}

/** Creates the meter of one statistic, or updates it when Home Assistant's energy preferences changed. */
export async function ensureHomeAssistantMeter(householdId: string, spec: HomeAssistantMeterSpec): Promise<string> {
  const data = {
    carrier: fromCarrier(spec.carrier),
    kind: fromKind(spec.kind),
    register: fromRegister(spec.register),
    applianceId: spec.applianceId ?? null,
  };
  const existing = await db.energyMeter.findFirst({
    where: { householdId, source: "HOME_ASSISTANT", haStatisticId: spec.statisticId },
    select: { id: true, carrier: true, kind: true, register: true, applianceId: true },
  });
  if (existing) {
    const same =
      existing.carrier === data.carrier && existing.kind === data.kind && existing.register === data.register && existing.applianceId === data.applianceId;
    if (!same) await db.energyMeter.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await db.energyMeter.create({
    data: { householdId, source: "HOME_ASSISTANT", haStatisticId: spec.statisticId, name: `Home Assistant ${spec.statisticId}`, ...data },
    select: { id: true },
  });
  return created.id;
}

/**
 * Links a Home Assistant device-consumption statistic to an appliance, so its use fills the appliance
 * breakdown; `null` unlinks it (the meter and its intervals are removed).
 */
export async function linkHomeAssistantStatistic(householdId: string, statisticId: string, applianceId: string | null): Promise<void> {
  const existing = await db.energyMeter.findFirst({
    where: { householdId, source: "HOME_ASSISTANT", haStatisticId: statisticId },
    select: { id: true, kind: true, applianceId: true },
  });
  if (!applianceId) {
    if (existing?.kind === "APPLIANCE") await db.energyMeter.delete({ where: { id: existing.id } });
    return;
  }
  await findOwnAppliance(householdId, applianceId);
  if (existing && existing.kind !== "APPLIANCE") throw badRequest("This statistic is a grid, solar or battery meter");
  if (existing) {
    if (existing.applianceId !== applianceId) await db.energyMeter.update({ where: { id: existing.id }, data: { applianceId } });
    return;
  }
  await ensureHomeAssistantMeter(householdId, { statisticId, carrier: "electricity", kind: "appliance", register: "single", applianceId });
}

export type MeterIntervalInput = {
  startAt: Date;
  endAt: Date;
  energyWh: number;
  volumeLitres: number | null;
  calorificWhPerM3: number | null;
};

/** Upserts measured intervals of one meter. Idempotent: the same meter + range replaces the value. */
export async function upsertMeterIntervals(meterId: string, intervals: readonly MeterIntervalInput[]): Promise<{ inserted: number; updated: number }> {
  const unique = new Map<string, MeterIntervalInput>();
  for (const interval of intervals) unique.set(`${interval.startAt.toISOString()}|${interval.endAt.toISOString()}`, interval);
  const values = [...unique.values()];
  let inserted = 0;
  let total = 0;
  for (let offset = 0; offset < values.length; offset += IMPORT_CHUNK) {
    const chunk = values.slice(offset, offset + IMPORT_CHUNK);
    const written = await db.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO energy_intervals ("meterId", "startAt", "endAt", "energyWh", "volumeLitres", "calorificWhPerM3", "status")
      SELECT ${meterId}, s, e, wh, l, c, 'MEASURED'::"EnergyIntervalStatus" FROM unnest(
        ${chunk.map((row) => row.startAt.toISOString())}::timestamptz[],
        ${chunk.map((row) => row.endAt.toISOString())}::timestamptz[],
        ${chunk.map((row) => row.energyWh)}::int[],
        ${chunk.map((row) => row.volumeLitres)}::int[],
        ${chunk.map((row) => row.calorificWhPerM3)}::int[]
      ) AS t(s, e, wh, l, c)
      ON CONFLICT ("meterId", "startAt", "endAt")
      DO UPDATE SET "energyWh" = EXCLUDED."energyWh", "volumeLitres" = EXCLUDED."volumeLitres",
                    "calorificWhPerM3" = EXCLUDED."calorificWhPerM3", "status" = EXCLUDED."status"
      RETURNING (xmax = 0) AS inserted`;
    total += written.length;
    inserted += written.filter((row) => row.inserted).length;
  }
  return { inserted, updated: total - inserted };
}

const IMPORT_CHUNK = 5000;

/** Drops the intervals of one Home Assistant statistic's meter, so the next import fetches it again. */
export async function clearHomeAssistantIntervals(householdId: string, statisticId: string): Promise<void> {
  await db.energyInterval.deleteMany({ where: { meter: { householdId, source: "HOME_ASSISTANT", haStatisticId: statisticId } } });
}

/** The household's gas calorific value (Wh/m³) for converting Home Assistant gas volumes. */
export async function gasCalorificWhPerM3(householdId: string): Promise<number> {
  return (await findSettings(householdId))?.gasCalorificWhPerM3 ?? DEFAULT_CALORIFIC_WH_PER_M3;
}
