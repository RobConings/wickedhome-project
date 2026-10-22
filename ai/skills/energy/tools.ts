import { z } from "zod";
import { APPLIANCE_CATEGORIES, READING_METERS, readingMeterCarrier, type ReadingMeter } from "@/features/energy/types/energy";
import { HOUSEHOLD_TIME_ZONE, todayIn } from "@/types/dates";
import { formatDateTime } from "@/types/date-format";
import { createAppliance, createReading, deleteAppliance, deleteReading, getEnergyData, getEnergySetup, getEnergySummary, listAppliances, updateAppliance } from "@/api/energy/energy.service";
import { HA_ENERGY_JOB_ID } from "@/api/home-assistant/home-assistant.jobs";
import { getEnergyOverview } from "@/api/home-assistant/ha-energy";
import { isHaHousehold } from "@/api/home-assistant/ha-connection";
import { startJobNow } from "@/api/jobs/job-scheduler";
import { HttpError } from "@/api/lib/http";
import { capList, dateSchema, day, done, entityRef, optionalDateSchema, registerAssistantSkill, registerAssistantTool, registerEntityResolver, registerScreenContext, round, say, timeSchema } from "@ai/core/kit";

/** Skill "energy": electricity, gas, solar, the capacity tariff, meter readings and appliances (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "energy",
  title: { en: "Energy", nl: "Energie" },
  summary: "Electricity and gas use, solar, self-sufficiency, capacity-tariff peak, meter readings, imports and appliances.",
  keywords: {
    nl: [
      "energie", "stroom", "elektriciteit", "verbruik", "verbruikt", "gas", "gasverbruik", "stroomverbruik", "energieverbruik", "zonnepanelen", "zonne-energie", "opgewekt", "injectie", "kwh",
      "piek", "capaciteitstarief", "energiegegevens", "meter", "meterstand", "batterij", "koelkast", "diepvries", "vaatwas", "warmtepomp", "laadpaal",
    ],
    en: ["energy", "energy data", "electricity", "power", "consumption", "usage", "gas", "solar", "kwh", "peak", "capacity tariff", "meter", "meter reading", "battery", "appliance", "fridge", "dishwasher", "heat pump", "charger"],
  },
});

const kwh = (wh: number | null | undefined) => (wh === null || wh === undefined ? null : round(wh / 1000));
const percent = (share: number | null | undefined) => (share === null || share === undefined ? null : Math.round(share * 100));

registerEntityResolver({
  type: "appliance",
  label: "appliance",
  skill: "energy",
  list: async (ctx) => (await listAppliances(ctx.householdId)).map((appliance) => ({ id: appliance.id, name: appliance.name, hint: appliance.place?.name, data: { placeId: appliance.placeId } })),
});

registerAssistantTool({
  name: "energy.summary",
  description:
    "Electricity or gas use of the home for a day, week, month or year: grid import/export, solar, consumption (kWh), self-sufficiency, biggest appliances, capacity-tariff peak. Data may lag a day (meter imports). No costs.",
  input: z.object({
    period: z.enum(["day", "week", "month", "year"]).default("day"),
    date: optionalDateSchema("A day inside the period, YYYY-MM-DD (default today)"),
    carrier: z.enum(["electricity", "gas"]).default("electricity"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the energy use", nl: "Energieverbruik bekeken" },
  run: async (ctx, input) => {
    const summary = await getEnergySummary(ctx.householdId, input.period, input.date ?? todayIn(), input.carrier);
    const { totals, status, breakdown, peak } = summary;
    return {
      carrier: summary.carrier,
      period: summary.period,
      from: summary.from,
      // `to` is the first day after the period.
      toExclusive: summary.to,
      hasData: status.hasGridData,
      importKwh: kwh(totals.importWh),
      importDayKwh: kwh(totals.importDayWh),
      importNightKwh: kwh(totals.importNightWh),
      exportKwh: kwh(totals.exportWh),
      solarKwh: kwh(totals.solarWh),
      consumptionKwh: kwh(totals.consumptionWh),
      gasM3: totals.volumeLitres === null ? null : round(totals.volumeLitres / 1000),
      selfSufficiencyPercent: percent(totals.selfSufficiency),
      topAppliances: breakdown.appliances.slice(0, 5).map((share) => `${share.name} ${kwh(share.energyWh)} kWh`),
      peak: input.carrier === "electricity" ? { month: peak.month, kw: peak.kw, billedKw: peak.billedKw } : null,
    };
  },
});

// ── Meters, readings and imports ────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "energy.status",
  description: "Where the energy data comes from and how fresh it is: meters with their last data, the Home Assistant import (last run, result), solar panels and home battery.",
  input: z.object({}),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the energy data", nl: "Energiegegevens bekeken" },
  run: async (ctx) => {
    const [data, setup, ha] = await Promise.all([getEnergyData(ctx.householdId), getEnergySetup(ctx.householdId), getEnergyOverview(ctx.householdId).catch(() => null)]);
    return {
      meters: capList(data.meters, 15, (meter) => `${meter.name} (${meter.carrier}, ${meter.source}): ${meter.lastAt ? `data until ${formatDateTime(meter.lastAt, ctx.locale)}` : "no data"}`),
      homeAssistantImport: ha?.status.linked
        ? { connection: ha.status.state, enabled: ha.enabled, lastImport: ha.lastImportAt ? formatDateTime(ha.lastImportAt, ctx.locale) : null, lastResult: ha.lastResult }
        : null,
      solar: setup.solarInstallations.map((solar) => `${solar.name}: ${solar.panelCount} panels, ${solar.kwp} kWp`),
      batteries: setup.batteries.map((battery) => `${battery.name}: ${kwh(battery.capacityWh)} kWh`),
    };
  },
});

registerAssistantTool({
  name: "energy.readings",
  description: "The latest manual meter readings (most recent first).",
  input: z.object({ limit: z.number().int().min(1).max(30).default(10) }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the meter readings", nl: "Meterstanden bekeken" },
  run: async (ctx, input) => {
    const { readings } = await getEnergyData(ctx.householdId);
    return capList(readings, input.limit, (reading) => {
      const value = reading.valueLitres !== null ? `${round(reading.valueLitres / 1000, 3)} m³` : `${kwh(reading.valueWh)} kWh`;
      const what = reading.applianceName ?? `${reading.kind}${reading.register !== "single" ? ` ${reading.register}` : ""}`;
      return `${formatDateTime(reading.readAt, ctx.locale)} ${what}: ${value}`;
    });
  },
});

/** "2026-10-04" + "08:30" (Brussels) → ISO instant with offset. */
function brusselsInstant(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: HOUSEHOLD_TIME_ZONE }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime())).toISOString();
}

const meterInput = z.enum(READING_METERS).describe("grid_import (taken from the grid), grid_export (injected), solar_production, battery_charge/discharge, appliance, gas, gas_appliance");

const readingLabel = (meter: ReadingMeter, register: string, appliance?: string) => `${appliance ?? meter.replace(/_/g, " ")}${register !== "single" ? ` (${register})` : ""}`;

registerAssistantTool({
  name: "energy.add_reading",
  description: "Record a manual meter reading: the meter's cumulative value (kWh, or m³ for gas), with the day/night register for a two-tariff meter.",
  input: z.object({
    meter: meterInput,
    value: z.number().min(0).max(2_000_000).describe("Register value: kWh, or m³ for gas"),
    register: z.enum(["single", "day", "night"]).default("single"),
    appliance: entityRef("appliance").optional().describe("For an appliance meter"),
    date: optionalDateSchema("Day of the reading, YYYY-MM-DD (default today)"),
    time: timeSchema().optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Recorded a meter reading", nl: "Meterstand genoteerd" },
  describe: (ctx, input) => {
    const unit = readingMeterCarrier(input.meter) === "gas" ? "m³" : "kWh";
    const value = `${String(input.value).replace(".", ctx.locale === "nl" ? "," : ".")} ${unit}`;
    const when = day(input.date ?? todayIn(), ctx.locale, true);
    return say(ctx.locale, `Record ${value} for ${readingLabel(input.meter, input.register, input.appliance?.name)} on ${when}`, `${value} noteren voor ${readingLabel(input.meter, input.register, input.appliance?.name)} op ${when}`);
  },
  run: async (ctx, input) => {
    const carrier = readingMeterCarrier(input.meter);
    const kind = input.meter === "gas" ? "grid_import" : input.meter === "gas_appliance" ? "appliance" : input.meter;
    if (kind === "appliance" && !input.appliance) return { ok: false, error: "Which appliance does this meter measure?" };
    const now = new Date().toLocaleTimeString("en-GB", { timeZone: HOUSEHOLD_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
    await createReading(ctx.householdId, {
      carrier,
      kind,
      register: input.register,
      applianceId: input.appliance?.id ?? null,
      readAt: brusselsInstant(input.date ?? todayIn(), input.time ?? now),
      ...(carrier === "gas" ? { valueLitres: Math.round(input.value * 1000) } : { valueWh: Math.round(input.value * 1000) }),
    });
    return done(`Recorded ${input.value} ${carrier === "gas" ? "m³" : "kWh"} for ${readingLabel(input.meter, input.register, input.appliance?.name)}.`);
  },
});

registerAssistantTool({
  name: "energy.delete_reading",
  description: "Delete a manual meter reading, by its day (and meter when there are several that day).",
  input: z.object({ date: dateSchema("Day of the reading, YYYY-MM-DD"), meter: meterInput.optional() }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a meter reading", nl: "Meterstand verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the meter reading of ${day(input.date, ctx.locale)}`, `De meterstand van ${day(input.date, ctx.locale)} verwijderen`),
  preview: async (ctx, input) => {
    await readingOf(ctx.householdId, input.date, input.meter);
    return null;
  },
  run: async (ctx, input) => {
    const reading = await readingOf(ctx.householdId, input.date, input.meter);
    await deleteReading(ctx.householdId, reading.id);
    return done(`Deleted the reading of ${day(input.date, "en")}.`);
  },
});

async function readingOf(householdId: string, date: string, meter?: ReadingMeter) {
  const { readings } = await getEnergyData(householdId);
  const onDay = readings.filter((reading) => todayIn(HOUSEHOLD_TIME_ZONE, new Date(reading.readAt)) === date);
  const matching = meter
    ? onDay.filter((reading) => (meter === "gas" ? reading.carrier === "gas" && reading.kind === "grid_import" : meter === "gas_appliance" ? reading.carrier === "gas" && reading.kind === "appliance" : reading.carrier === "electricity" && reading.kind === meter))
    : onDay;
  if (matching.length === 1) return matching[0]!;
  throw new HttpError(400, "bad_request", matching.length ? `There are ${matching.length} readings that day: say which meter.` : "There is no manual reading on that day.");
}

registerAssistantTool({
  name: "energy.import_now",
  description: "Fetch the energy data from Home Assistant now (it also runs every hour).",
  input: z.object({}),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Started the energy import", nl: "Energie-import gestart" },
  describe: (ctx) => say(ctx.locale, "Fetch the energy data from Home Assistant now", "De energiegegevens nu ophalen uit Home Assistant"),
  run: async (ctx) => {
    if (!(await isHaHousehold(ctx.householdId))) return { ok: false, error: "Home Assistant is not set up for this household." };
    startJobNow(HA_ENERGY_JOB_ID);
    return done("The energy import started; new data shows up in a minute.");
  },
});

// ── Appliances ──────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "energy.appliances",
  description: "Appliances (fridge, washing machine, heat pump…) with their room, category, power and whether a meter measures them.",
  input: z.object({ room: entityRef("place").optional() }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the appliances", nl: "Toestellen bekeken" },
  run: async (ctx, input) => {
    const appliances = (await listAppliances(ctx.householdId)).filter((appliance) => !input.room || appliance.placeId === input.room.id);
    return capList(appliances, 40, (appliance) =>
      [
        appliance.name,
        appliance.place?.name,
        appliance.category,
        appliance.ratedPowerW !== null ? `${appliance.ratedPowerW} W` : null,
        appliance.standbyPowerW !== null ? `standby ${appliance.standbyPowerW} W` : null,
        appliance.measured ? "measured" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  },
});

const applianceFields = {
  category: z.enum(APPLIANCE_CATEGORIES).optional(),
  room: entityRef("place").optional(),
  carriers: z.array(z.enum(["electricity", "gas"])).min(1).max(2).optional(),
  ratedPowerW: z.number().int().min(0).max(100_000).optional(),
  standbyPowerW: z.number().int().min(0).max(10_000).optional(),
  notes: z.string().trim().max(500).optional(),
};

registerAssistantTool({
  name: "energy.save_appliance",
  description: "Add an appliance (name + category), or change one (appliance + the fields to change: name, room, category, power).",
  input: z.object({ appliance: entityRef("appliance").optional().describe("Existing appliance to change"), name: z.string().trim().min(1).max(80).optional(), ...applianceFields }),
  permission: "write",
  confirm: "always",
  activity: { en: "Saved an appliance", nl: "Toestel bewaard" },
  describe: (ctx, input) =>
    input.appliance
      ? say(ctx.locale, `Change the appliance ${input.appliance.name}`, `Het toestel ${input.appliance.name} aanpassen`)
      : say(ctx.locale, `Add the appliance “${input.name ?? "?"}”${input.room ? ` in ${input.room.name}` : ""}`, `Het toestel “${input.name ?? "?"}” toevoegen${input.room ? ` in ${input.room.name}` : ""}`),
  run: async (ctx, input) => {
    const current = input.appliance ? (await listAppliances(ctx.householdId)).find((appliance) => appliance.id === input.appliance!.id) : undefined;
    const name = input.name ?? current?.name;
    const category = input.category ?? current?.category;
    if (!name || !category) return { ok: false, error: "A new appliance needs a name and a category." };
    const data = {
      name,
      category,
      carriers: input.carriers ?? (current?.carriers.filter((carrier): carrier is "electricity" | "gas" => carrier !== "water") ?? ["electricity"]),
      placeId: input.room?.id ?? current?.placeId ?? null,
      ratedPowerW: input.ratedPowerW ?? current?.ratedPowerW ?? null,
      standbyPowerW: input.standbyPowerW ?? current?.standbyPowerW ?? null,
      notes: input.notes ?? current?.notes ?? null,
    };
    const saved = current ? await updateAppliance(ctx.householdId, current.id, data) : await createAppliance(ctx.householdId, data);
    return done(`${current ? "Saved" : "Added"} ${saved.name}${saved.place ? ` (${saved.place.name})` : ""}.`, { id: saved.id });
  },
});

registerAssistantTool({
  name: "energy.delete_appliance",
  description: "Delete an appliance, with its meters and their data.",
  input: z.object({ appliance: entityRef("appliance") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted an appliance", nl: "Toestel verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the appliance ${input.appliance.name} and its meter data`, `Het toestel ${input.appliance.name} en zijn metergegevens verwijderen`),
  run: async (ctx, input) => {
    await deleteAppliance(ctx.householdId, input.appliance.id);
    return done(`Deleted ${input.appliance.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the energy pages (overview, appliances) ──

registerScreenContext({
  kind: "energy",
  skills: ["energy"],
  describe: (ctx) => ({ label: say(ctx.locale, "Energy", "Energie"), summary: "the energy pages (usage, meter readings, appliances)" }),
});
