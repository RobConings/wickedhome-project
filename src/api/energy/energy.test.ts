/**
 * Unit tests for the Fluvius CSV parser, DST handling and energy periods. No database needed. Run on the
 * server:
 *
 *   npx tsx --test src/api/energy/energy.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketLabels, periodRange, shiftPeriod } from "@/features/energy/types/energy-period";
import { wallClockInstants, zonedDateTimeToIso } from "@/features/energy/types/energy-time";
import { compassPoint, solarKwp } from "@/features/energy/types/energy";
import { FluviusFormatError, parseFluviusCsv, parseFluviusCsvInChunks } from "@/features/energy/types/fluvius-csv";

const NL_HEADER = "Van datum;Van tijdstip;Tot datum;Tot tijdstip;EAN;Meter;Metertype;Register;Volume;Eenheid;Validatiestatus";
const EN_HEADER =
  "From (date);From (time);Until (date);Until (time);EAN code;Meter;Meter type;Register;Volume;Unit;Validation status";

const nlRow = (date: string, from: string, to: string, register: string, volume: string, status = "Gevalideerd", toDate = date) =>
  `${date};${from};${toDate};${to};="541448820000000000";1SAG1100000000;Digitale Meter;${register};${volume};kWh;${status}`;

describe("parseFluviusCsv", () => {
  it("reads the Dutch export with BOM, comma decimals and an empty volume", () => {
    const csv = [
      `\uFEFF${NL_HEADER}`,
      nlRow("14-01-2026", "00:00:00", "00:15:00", "Afname Nacht", "0,123"),
      nlRow("14-01-2026", "00:00:00", "00:15:00", "Injectie Nacht", "", "Geen verbruik"),
      nlRow("14-01-2026", "12:00:00", "12:15:00", "Afname Dag", "0,05", "Geschat"),
      nlRow("14-01-2026", "12:00:00", "12:15:00", "Injectie Dag", "0,412"),
      "",
    ].join("\r\n");

    const result = parseFluviusCsv(csv);
    assert.equal(result.ean, "541448820000000000");
    assert.equal(result.intervals.length, 4);
    assert.deepEqual(result.intervals[0], {
      kind: "grid_import",
      register: "night",
      start: "2026-01-13T23:00:00.000Z",
      end: "2026-01-13T23:15:00.000Z",
      energyWh: 123,
      status: "validated",
    });
    assert.equal(result.intervals[1]?.status, "no_usage");
    assert.equal(result.intervals[1]?.energyWh, 0);
    assert.equal(result.intervals[2]?.status, "estimated");
    assert.equal(result.firstAt, "2026-01-14");
    assert.equal(result.lastAt, "2026-01-14");
    assert.deepEqual(
      result.registers.map((register) => [register.register, register.rows, register.energyWh]),
      [
        ["grid_export:day", 1, 412],
        ["grid_export:night", 1, 0],
        ["grid_import:day", 1, 50],
        ["grid_import:night", 1, 123],
      ],
    );
  });

  it("reads the English export with slashes and single-tariff registers", () => {
    const csv = [
      EN_HEADER,
      `01/07/2026;10:00:00;01/07/2026;10:15:00;="5414";X;Digital;Offtake;0,2;kWh;Validated`,
      `01/07/2026;10:00:00;01/07/2026;10:15:00;="5414";X;Digital;Injection Day;1,1;kWh;Validated`,
    ].join("\n");
    const result = parseFluviusCsv(csv);
    assert.equal(result.intervals[0]?.register, "single");
    assert.equal(result.intervals[0]?.start, "2026-07-01T08:00:00.000Z");
    assert.equal(result.intervals[1]?.kind, "grid_export");
    assert.equal(result.intervals[1]?.energyWh, 1100);
  });

  it("resolves the doubled autumn hour (25 October 2026)", () => {
    const rows = [
      nlRow("25-10-2026", "01:45:00", "02:00:00", "Afname Nacht", "0,1"),
      nlRow("25-10-2026", "02:00:00", "02:15:00", "Afname Nacht", "0,1"),
      nlRow("25-10-2026", "02:45:00", "03:00:00", "Afname Nacht", "0,1"),
      nlRow("25-10-2026", "02:00:00", "02:15:00", "Afname Nacht", "0,2"),
      nlRow("25-10-2026", "02:45:00", "03:00:00", "Afname Nacht", "0,2"),
      nlRow("25-10-2026", "03:00:00", "03:15:00", "Afname Nacht", "0,1"),
    ];
    const { intervals } = parseFluviusCsv([NL_HEADER, ...rows].join("\n"));
    assert.deepEqual(
      intervals.map((interval) => [interval.start.slice(11, 16), interval.end.slice(11, 16)]),
      [
        ["23:45", "00:00"],
        ["00:00", "00:15"], // 02:00 CEST
        ["00:45", "01:00"],
        ["01:00", "01:15"], // 02:00 CET
        ["01:45", "02:00"],
        ["02:00", "02:15"],
      ],
    );
    assert.equal(new Set(intervals.map((interval) => interval.start)).size, intervals.length);
  });

  it("skips the missing spring hour (29 March 2026) without overlaps", () => {
    const rows = [
      nlRow("29-03-2026", "01:45:00", "02:00:00", "Afname Nacht", "0,1"),
      nlRow("29-03-2026", "03:00:00", "03:15:00", "Afname Nacht", "0,1"),
    ];
    const { intervals } = parseFluviusCsv([NL_HEADER, ...rows].join("\n"));
    assert.deepEqual(
      intervals.map((interval) => [interval.start.slice(11, 16), interval.end.slice(11, 16)]),
      [
        ["00:45", "01:00"],
        ["01:00", "01:15"],
      ],
    );
  });

  it("reports unreadable rows and rejects files that are not a Fluvius export", () => {
    const csv = [NL_HEADER, nlRow("32-13-2026", "00:00:00", "00:15:00", "Afname Dag", "0,1"), nlRow("14-01-2026", "00:00:00", "00:15:00", "Gas", "1")].join("\n");
    const result = parseFluviusCsv(csv);
    assert.equal(result.intervals.length, 0);
    assert.deepEqual(result.skipped, [
      { line: 2, reason: "date" },
      { line: 3, reason: "register" },
    ]);
    assert.throws(() => parseFluviusCsv("name,amount\nfoo,1"), FluviusFormatError);
    assert.throws(() => parseFluviusCsv("\uFEFF\n\n"), FluviusFormatError);
  });
});

const GAS_HEADER = `${NL_HEADER};Omrekeningsfactor;Calorische Bovenwaarde`;
const gasRow = (date: string, from: string, to: string, volume: string, unit: string, calorific = "11,537", toDate = date) =>
  `${date};${from};${toDate};${to};="541448820000000001";2GAS0012345;Digitale Meter;Afname;${volume};${unit};Gevalideerd;;${calorific}`;

describe("parseFluviusCsv: gas", () => {
  it("merges the m³ and kWh rows of one hour and keeps the volume and calorific value", () => {
    const csv = [
      GAS_HEADER,
      gasRow("14-01-2026", "06:00:00", "07:00:00", "0,412", "m³"),
      gasRow("14-01-2026", "06:00:00", "07:00:00", "4,753", "kWh"),
      gasRow("14-01-2026", "07:00:00", "08:00:00", "0,655", "m³"),
      gasRow("14-01-2026", "07:00:00", "08:00:00", "7,557", "kWh"),
    ].join("\r\n");
    const result = parseFluviusCsv(csv);
    assert.equal(result.carrier, "gas");
    assert.equal(result.intervals.length, 2);
    assert.deepEqual(result.intervals[0], {
      kind: "grid_import",
      register: "single",
      start: "2026-01-14T05:00:00.000Z",
      end: "2026-01-14T06:00:00.000Z",
      energyWh: 4753,
      volumeLitres: 412,
      calorificWhPerM3: 11537,
      status: "validated",
    });
    assert.deepEqual(result.calorific, { min: 11.537, max: 11.537 });
    assert.deepEqual(
      result.registers.map((register) => [register.register, register.rows, register.energyWh, register.volumeLitres]),
      [["grid_import:single", 2, 12310, 1067]],
    );
  });

  it("converts m³-only rows with the file's calorific value", () => {
    const csv = [GAS_HEADER, gasRow("02-02-2026", "18:00:00", "19:00:00", "1,250", "m³", "11,2")].join("\n");
    const [interval] = parseFluviusCsv(csv).intervals;
    assert.equal(interval?.energyWh, 14_000);
    assert.equal(interval?.volumeLitres, 1250);
    assert.equal(interval?.calorificWhPerM3, 11_200);
  });

  it("detects gas from the file name and falls back to the default calorific value", () => {
    const csv = [
      EN_HEADER,
      `02/02/2026;18:00:00;02/02/2026;19:00:00;="5414";G;Digital;Offtake;0,5;m3;Validated`,
    ].join("\n");
    const result = parseFluviusCsv(csv, {
      fileName: "Verbruikshistoriek_gas_541448820000000001_20260101_20260201_uurtotalen.csv",
      defaultCalorificWhPerM3: 11_000,
    });
    assert.equal(result.carrier, "gas");
    assert.equal(result.intervals[0]?.energyWh, 5500);
    assert.equal(result.intervals[0]?.calorificWhPerM3, 11_000);
  });

  it("keeps both autumn 02:00 hours apart (25 October 2026)", () => {
    const rows = [
      gasRow("25-10-2026", "02:00:00", "03:00:00", "0,30", "m³"),
      gasRow("25-10-2026", "02:00:00", "03:00:00", "3,46", "kWh"),
      gasRow("25-10-2026", "02:00:00", "03:00:00", "0,28", "m³"),
      gasRow("25-10-2026", "02:00:00", "03:00:00", "3,23", "kWh"),
    ];
    const { intervals } = parseFluviusCsv([GAS_HEADER, ...rows].join("\n"));
    assert.deepEqual(
      intervals.map((interval) => [interval.start.slice(11, 16), interval.energyWh, interval.volumeLitres]),
      [
        ["00:00", 3460, 300],
        ["01:00", 3230, 280],
      ],
    );
  });

  it("reads an electricity file as electricity", () => {
    const csv = [NL_HEADER, nlRow("14-01-2026", "00:00:00", "00:15:00", "Afname Nacht", "0,123")].join("\n");
    assert.equal(parseFluviusCsv(csv).carrier, "electricity");
  });
});

describe("parseFluviusCsvInChunks", () => {
  const rows = Array.from({ length: 96 * 30 }, (_, quarter) => {
    const day = String(1 + Math.floor(quarter / 96)).padStart(2, "0");
    const hour = Math.floor((quarter % 96) / 4);
    const minute = (quarter % 4) * 15;
    const end = (quarter % 96) + 1;
    const from = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const to = end === 96 ? "00:00:00" : `${String(Math.floor(end / 4)).padStart(2, "0")}:${String((end % 4) * 15).padStart(2, "0")}:00`;
    const toDate = end === 96 ? `${String(Number(day) + 1).padStart(2, "0")}-04-2026` : `${day}-04-2026`;
    return nlRow(`${day}-04-2026`, from, to, "Afname Dag", "0,1", "Gevalideerd", toDate);
  });
  const csv = [NL_HEADER, ...rows].join("\n");

  it("gives the same result as the one-go parser and reports progress", async () => {
    const progress: number[] = [];
    const result = await parseFluviusCsvInChunks(csv, { onProgress: ({ done }) => progress.push(done) });
    assert.deepEqual(result, parseFluviusCsv(csv));
    assert.equal(result.intervals.length, 2880);
    assert.deepEqual(progress, [2000]);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(parseFluviusCsvInChunks(csv, { signal: controller.signal }), { name: "AbortError" });
  });
});

describe("energy time and periods", () => {
  it("converts Brussels wall-clock time", () => {
    assert.equal(zonedDateTimeToIso("2026-01-14", "08:30"), "2026-01-14T07:30:00.000Z");
    assert.equal(zonedDateTimeToIso("2026-07-14", "08:30"), "2026-07-14T06:30:00.000Z");
    assert.equal(wallClockInstants({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }).length, 2);
    assert.equal(wallClockInstants({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }).length, 0);
  });

  it("computes period ranges, navigation and bucket labels", () => {
    assert.deepEqual(periodRange("week", "2026-10-01"), { from: "2026-09-28", to: "2026-10-05" });
    assert.deepEqual(periodRange("month", "2026-02-14"), { from: "2026-02-01", to: "2026-03-01" });
    assert.deepEqual(periodRange("year", "2026-02-14"), { from: "2026-01-01", to: "2027-01-01" });
    assert.equal(shiftPeriod("month", "2026-03-31", -1), "2026-02-01");
    assert.equal(shiftPeriod("week", "2026-10-01", 1), "2026-10-05");
    assert.equal(bucketLabels("day", "2026-10-25").length, 24);
    assert.equal(bucketLabels("month", "2026-02-10").length, 28);
    assert.deepEqual(bucketLabels("year", "2026-05-01").slice(0, 2), ["2026-01", "2026-02"]);
  });

  it("computes kWp and compass points", () => {
    assert.equal(solarKwp({ panelCount: 15, panelWp: 400 }), 6);
    assert.equal(compassPoint(180), "s");
    assert.equal(compassPoint(260), "w");
    assert.equal(compassPoint(350), "n");
  });
});
