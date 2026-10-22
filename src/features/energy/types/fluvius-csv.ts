import type { ActiveCarrier, EnergyRegister, ImportedInterval, IntervalStatus } from "./energy";
import { wallClockInstants, wallClockToInstant, type WallClock } from "./energy-time";

/**
 * Parser for the Fluvius "verbruikshistoriek" CSV: electricity (quarter-hour totals, offtake/injection
 * day/night) and gas (hour totals, offtake in m³ and/or kWh with the gross calorific value). Pure: no React,
 * no DOM, so it runs in the browser (the import screen) and in Node (tests). Handles the Dutch and the
 * English export, `DD-MM-YYYY` and `DD/MM/YYYY`, a UTF-8 BOM, `="…"`-wrapped EANs, comma decimals, empty
 * volumes ("Geen verbruik") and the doubled autumn DST hour. The carrier is detected from the file name,
 * the header and the units. See docs/ENERGY.md.
 */

export type FluviusRegister = `${ImportedInterval["kind"]}:${EnergyRegister}`;

export type FluviusRegisterSummary = {
  register: FluviusRegister;
  kind: ImportedInterval["kind"];
  tariff: EnergyRegister;
  rows: number;
  energyWh: number;
  /** Gas: total volume in litres (m³ × 1000), when the file gives m³. */
  volumeLitres: number | null;
};

export type FluviusParseResult = {
  carrier: ActiveCarrier;
  intervals: ImportedInterval[];
  /** EAN of the connection, when the file has one. */
  ean: string | null;
  /** Local `YYYY-MM-DD` of the first interval start and the last interval end. */
  firstAt: string | null;
  lastAt: string | null;
  registers: FluviusRegisterSummary[];
  /** Gas: lowest and highest calorific value in the file, kWh/m³. */
  calorific: { min: number; max: number } | null;
  /** Rows that could not be read (bad dates, unknown registers…), with 1-based line numbers. */
  skipped: { line: number; reason: FluviusSkipReason }[];
};

export type FluviusSkipReason = "date" | "register" | "volume" | "columns";

export class FluviusFormatError extends Error {
  constructor(readonly code: "empty" | "header") {
    super(code === "empty" ? "The file is empty" : "This does not look like a Fluvius consumption export");
  }
}

// Columns ------------------------------------------------------------------------------------------------

type Column =
  | "fromDate"
  | "fromTime"
  | "toDate"
  | "toTime"
  | "ean"
  | "register"
  | "volume"
  | "unit"
  | "status"
  | "calorific";

/** Header names, normalised (lowercase, letters and digits only), NL and EN. */
const HEADERS: Record<Column, string[]> = {
  fromDate: ["vandatum", "fromdate", "startdatum", "startdate"],
  fromTime: ["vantijdstip", "fromtime", "starttijd", "starttime"],
  toDate: ["totdatum", "untildate", "todate", "einddatum", "enddate"],
  toTime: ["tottijdstip", "untiltime", "totime", "eindtijd", "endtime"],
  ean: ["ean", "eancode"],
  register: ["register"],
  volume: ["volume"],
  unit: ["eenheid", "unit"],
  status: ["validatiestatus", "validationstatus", "status"],
  calorific: [
    "calorischebovenwaarde",
    "calorischewaarde",
    "bovenwaarde",
    "calorificvalue",
    "grosscalorificvalue",
    "uppercalorificvalue",
    "highercalorificvalue",
  ],
};

const REQUIRED: Column[] = ["fromDate", "fromTime", "toDate", "toTime", "register", "volume"];

const normalise = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Splits one line, honouring double quotes ("a;b" stays one field, "" is a literal quote). */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields.map(unwrap);
}

/** `="541448…"` (Excel's keep-as-text trick) → `541448…`. */
const unwrap = (value: string) => value.trim().replace(/^="?(.*?)"?$/, "$1").trim();

// Values -------------------------------------------------------------------------------------------------

function parseDate(value: string): { year: number; month: number; day: number } | null {
  let match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return null;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  // 24:00 is how some exports write the end of the day.
  return hour <= 24 && minute < 60 ? { hour, minute } : null;
}

function parseClock(date: string, time: string): WallClock | null {
  const d = parseDate(date);
  const t = parseTime(time);
  if (!d || !t || d.month < 1 || d.month > 12 || d.day < 1 || d.day > 31) return null;
  return { ...d, ...t };
}

/** "0,123" / "1.234,5" / "0.123" → number; empty → null. */
function parseVolume(value: string): number | null | undefined {
  const text = value.replace(/\s/g, "");
  if (text === "") return null;
  const normalised = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalised);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

type Unit = "kwh" | "wh" | "m3" | "other";

/** "kWh", "Wh", "m³", "m3", "M3", "Nm³" → a unit (NFKD turns ³ into 3). */
function parseUnit(value: string): Unit {
  const text = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (text === "kwh") return "kwh";
  if (text === "wh") return "wh";
  if (text === "m3" || text === "nm3") return "m3";
  return "other";
}

/** "11,537" kWh/m³ → 11537 Wh/m³. A value around 40 is MJ/m³ (some exports), converted. Null when unusable. */
function parseCalorific(value: string): number | null {
  const number = parseVolume(value);
  if (number == null || number === 0) return null;
  const kwhPerM3 = number >= 30 && number <= 50 ? number / 3.6 : number;
  return kwhPerM3 >= 5 && kwhPerM3 <= 15 ? Math.round(kwhPerM3 * 1000) : null;
}

/** Gas when the file name says so, the header has a calorific value, or the rows are in m³ or mention gas. */
function detectCarrier(fileName: string | undefined, hasCalorific: boolean, sample: { unit: string; register: string }[]): ActiveCarrier {
  if (fileName && /[_-]gas[_-]/i.test(fileName)) return "gas";
  if (fileName && /[_-]elektriciteit[_-]|[_-]electricity[_-]/i.test(fileName)) return "electricity";
  if (hasCalorific) return "gas";
  // Otherwise most rows decide, so one odd row doesn't turn an electricity file into gas.
  const gasLike = sample.filter((row) => parseUnit(row.unit) === "m3" || /gas/.test(normalise(row.register))).length;
  return gasLike * 2 > sample.length ? "gas" : "electricity";
}

function parseRegister(value: string): { kind: ImportedInterval["kind"]; tariff: EnergyRegister } | null {
  const text = normalise(value);
  const kind = /afname|offtake|consumption|verbruik/.test(text)
    ? "grid_import"
    : /injectie|injection|productie|production/.test(text)
      ? "grid_export"
      : null;
  if (!kind) return null;
  const tariff: EnergyRegister = /nacht|night/.test(text) ? "night" : /dag|day/.test(text) ? "day" : "single";
  return { kind, tariff };
}

/** Gas files only have offtake ("Afname" / "Offtake"), sometimes just "Gas" or nothing useful. */
function parseGasRegister(value: string): { kind: ImportedInterval["kind"]; tariff: EnergyRegister } | null {
  return /injectie|injection/.test(normalise(value)) ? null : { kind: "grid_import", tariff: "single" };
}

function parseStatus(value: string, volume: number | null): IntervalStatus {
  const text = normalise(value);
  if (volume === null || /geenverbruik|nousage|noconsumption/.test(text)) return "no_usage";
  if (/geschat|estimated/.test(text)) return "estimated";
  if (/gevalideerd|validated/.test(text)) return "validated";
  return "measured";
}

const asUtcMinutes = (clock: WallClock) =>
  Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute) / 60_000;

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
const clockKey = (clock: WallClock) =>
  `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}`;

// Parser ---------------------------------------------------------------------------------------------------

export type FluviusParseOptions = {
  /** The file name helps tell electricity from gas (`Verbruikshistoriek_gas_…`). */
  fileName?: string;
  /** Gas rows in m³ without a calorific value in the file are converted with this (Wh/m³). */
  defaultCalorificWhPerM3?: number;
  timeZone?: string;
};

type GasRow = {
  start: number;
  end: number;
  energyWh: number | null;
  volumeLitres: number | null;
  calorificWhPerM3: number | null;
  status: IntervalStatus;
};

/** How far parsing got: lines read out of all lines in the file. */
export type FluviusParseProgress = { done: number; total: number };

/** Lines parsed between two progress steps (and, in the browser, between two pauses). */
const CHUNK_LINES = 2000;

/** Parses a whole file at once. For big files in the browser use `parseFluviusCsvInChunks`. */
export function parseFluviusCsv(text: string, options: FluviusParseOptions = {}): FluviusParseResult {
  const steps = fluviusParseSteps(text, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * Parses in chunks and gives the browser a moment between them, so a year of quarter-hours (140,000 rows)
 * never freezes the page. Reports progress and stops with an `AbortError` when `signal` is aborted.
 */
export async function parseFluviusCsvInChunks(
  text: string,
  options: FluviusParseOptions & { onProgress?: (progress: FluviusParseProgress) => void; signal?: AbortSignal } = {},
): Promise<FluviusParseResult> {
  const steps = fluviusParseSteps(text, options);
  for (;;) {
    if (options.signal?.aborted) throw new DOMException("Parsing stopped", "AbortError");
    const step = steps.next();
    if (step.done) return step.value;
    options.onProgress?.(step.value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The parser itself, yielding progress every `CHUNK_LINES` lines. */
function* fluviusParseSteps(
  text: string,
  options: FluviusParseOptions,
): Generator<FluviusParseProgress, FluviusParseResult, void> {
  const { fileName, defaultCalorificWhPerM3 = 11_400, timeZone = "Europe/Brussels" } = options;
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) throw new FluviusFormatError("empty");

  const headerLine = lines[headerIndex] ?? "";
  const delimiter = headerLine.includes(";") ? ";" : headerLine.includes("\t") ? "\t" : ",";
  const header = splitLine(headerLine, delimiter).map(normalise);
  const columns = {} as Record<Column, number>;
  for (const [column, names] of Object.entries(HEADERS) as [Column, string[]][]) {
    columns[column] = header.findIndex((name) => names.includes(name));
  }
  if (REQUIRED.some((column) => columns[column] < 0)) throw new FluviusFormatError("header");

  const sample = lines.slice(headerIndex + 1, headerIndex + 60).filter((line) => line.trim() !== "").map((line) => {
    const fields = splitLine(line, delimiter);
    return { unit: fields[columns.unit] ?? "", register: fields[columns.register] ?? "" };
  });
  const carrier = detectCarrier(fileName, columns.calorific >= 0, sample);
  /** Gas: m³ and kWh rows of the same hour merge into one interval. */
  const gasRows = new Map<string, GasRow>();

  const intervals: ImportedInterval[] = [];
  const skipped: FluviusParseResult["skipped"] = [];
  const registers = new Map<FluviusRegister, FluviusRegisterSummary>();
  /** How often each register + local start time was seen: the second time is the repeated autumn hour. */
  const seen = new Map<string, number>();
  let ean: string | null = null;
  let first = Infinity;
  let last = -Infinity;

  for (let index = headerIndex + 1; index < lines.length; index++) {
    if ((index - headerIndex) % CHUNK_LINES === 0) yield { done: index, total: lines.length };
    const line = lines[index] ?? "";
    if (line.trim() === "") continue;
    const lineNumber = index + 1;
    const fields = splitLine(line, delimiter);
    const field = (column: Column) => (columns[column] >= 0 ? (fields[columns[column]] ?? "") : "");
    if (fields.length < REQUIRED.length) {
      skipped.push({ line: lineNumber, reason: "columns" });
      continue;
    }

    // A gas file's register is just "Afname"; the carrier decides what it means.
    const register = carrier === "gas" ? parseGasRegister(field("register")) : parseRegister(field("register"));
    if (!register) {
      skipped.push({ line: lineNumber, reason: "register" });
      continue;
    }

    const volume = parseVolume(field("volume"));
    if (volume === undefined) {
      skipped.push({ line: lineNumber, reason: "volume" });
      continue;
    }

    const fromClock = parseClock(field("fromDate"), field("fromTime"));
    const toClock = parseClock(field("toDate"), field("toTime"));
    if (!fromClock || !toClock) {
      skipped.push({ line: lineNumber, reason: "date" });
      continue;
    }

    const key = `${register.kind}:${register.tariff}`;
    const unitText = field("unit");
    const occurrenceKey = `${key}|${normalise(unitText)}|${clockKey(fromClock)}`;
    const occurrence = seen.get(occurrenceKey) ?? 0;
    seen.set(occurrenceKey, occurrence + 1);

    const start = wallClockToInstant(fromClock, occurrence, timeZone);
    // Quarter-hours and hours keep their wall-clock length, even when the label crosses a DST switch
    // ("02:45 → 03:00" on the autumn day is still 15 minutes). Longer rows (days) end at the first instant
    // after the start that shows the end time.
    const wallMs = (asUtcMinutes(toClock) - asUtcMinutes(fromClock)) * 60_000;
    const end =
      wallMs > 0 && wallMs <= 3_600_000
        ? start + wallMs
        : (wallClockInstants(toClock, timeZone).find((instant) => instant > start) ??
          wallClockToInstant(toClock, 1, timeZone));
    if (!(end > start)) {
      skipped.push({ line: lineNumber, reason: "date" });
      continue;
    }

    const unit = parseUnit(unitText);
    ean ??= field("ean") || null;
    first = Math.min(first, start);
    last = Math.max(last, end);

    if (carrier === "gas") {
      const rowKey = `${start}|${end}`;
      const row = gasRows.get(rowKey) ?? {
        start,
        end,
        energyWh: null,
        volumeLitres: null,
        calorificWhPerM3: null,
        status: parseStatus(field("status"), volume),
      };
      row.calorificWhPerM3 ??= columns.calorific >= 0 ? parseCalorific(field("calorific")) : null;
      if (unit === "m3") row.volumeLitres = Math.round((volume ?? 0) * 1000);
      else if (unit === "wh") row.energyWh = Math.round(volume ?? 0);
      else row.energyWh = Math.round((volume ?? 0) * 1000);
      if (volume !== null) row.status = parseStatus(field("status"), volume);
      gasRows.set(rowKey, row);
      continue;
    }

    const energyWh = volume === null ? 0 : Math.round(unit === "wh" ? volume : volume * 1000);

    intervals.push({
      kind: register.kind,
      register: register.tariff,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      energyWh,
      status: parseStatus(field("status"), volume),
    });

    const summary = registers.get(key as FluviusRegister) ?? {
      register: key as FluviusRegister,
      kind: register.kind,
      tariff: register.tariff,
      rows: 0,
      energyWh: 0,
      volumeLitres: null,
    };
    summary.rows += 1;
    summary.energyWh += energyWh;
    registers.set(key as FluviusRegister, summary);
  }

  // Gas: one interval per hour; convert m³ with the calorific value when the file has no kWh.
  let calorificMin = Infinity;
  let calorificMax = -Infinity;
  for (const row of gasRows.values()) {
    const calorific = row.calorificWhPerM3 ?? (row.energyWh === null ? defaultCalorificWhPerM3 : null);
    const energyWh = row.energyWh ?? Math.round(((row.volumeLitres ?? 0) / 1000) * (calorific ?? defaultCalorificWhPerM3));
    if (row.calorificWhPerM3 !== null) {
      calorificMin = Math.min(calorificMin, row.calorificWhPerM3);
      calorificMax = Math.max(calorificMax, row.calorificWhPerM3);
    }
    intervals.push({
      kind: "grid_import",
      register: "single",
      start: new Date(row.start).toISOString(),
      end: new Date(row.end).toISOString(),
      energyWh,
      volumeLitres: row.volumeLitres,
      calorificWhPerM3: calorific,
      status: row.status,
    });
    const summary = registers.get("grid_import:single") ?? {
      register: "grid_import:single" as FluviusRegister,
      kind: "grid_import" as const,
      tariff: "single" as const,
      rows: 0,
      energyWh: 0,
      volumeLitres: null,
    };
    summary.rows += 1;
    summary.energyWh += energyWh;
    if (row.volumeLitres !== null) summary.volumeLitres = (summary.volumeLitres ?? 0) + row.volumeLitres;
    registers.set("grid_import:single", summary);
  }

  // en-CA formats as YYYY-MM-DD.
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const localDate = (instant: number) => dayFormat.format(new Date(instant));

  return {
    carrier,
    intervals,
    ean,
    // The last end is midnight after the last day; show the day the data covers.
    firstAt: Number.isFinite(first) ? localDate(first) : null,
    lastAt: Number.isFinite(last) ? localDate(last - 1) : null,
    registers: [...registers.values()].sort((a, b) => a.register.localeCompare(b.register)),
    calorific: Number.isFinite(calorificMin) ? { min: calorificMin / 1000, max: calorificMax / 1000 } : null,
    skipped,
  };
}

/** Splits parsed intervals into request-sized batches. */
export function batchIntervals<T>(intervals: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < intervals.length; index += size) batches.push(intervals.slice(index, index + size));
  return batches;
}
