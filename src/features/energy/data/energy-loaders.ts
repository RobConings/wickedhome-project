import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiRequestError } from "@/lib/api-client";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import { todayIn } from "@/types/dates";
import { fetchPlaces, type Place } from "@/features/places";
import {
  applianceInputSchema,
  batteryFormSchema,
  energySettingsFormSchema,
  meterReadingFormSchema,
  solarInstallationInputSchema,
  summaryViewSchema,
  type EnergySetup,
  type EnergySummary,
} from "../types/energy";

/** What the overview shows once loaded. */
export type EnergyOverview = { summary: EnergySummary; setup: EnergySetup };
import { energyPeriodSchema, periodStart } from "../types/energy-period";
import {
  createAppliance,
  createBattery,
  createReading,
  createSolarInstallation,
  deleteAppliance,
  deleteBattery,
  deleteReading,
  deleteSolarInstallation,
  fetchAppliances,
  fetchAppliance,
  fetchEnergyData,
  fetchEnergyMeterDetail,
  fetchEnergySetup,
  fetchEnergySummary,
  saveEnergySettings,
  updateAppliance,
  updateBattery,
  updateSolarInstallation,
} from "./energy-requests";

export type EnergyActionResult = FormResult & { intent?: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `/energy?carrier=gas&period=month&date=2026-10-01`: carrier, period and date come from the URL so they can
 * be shared. The summary is an aggregate over many intervals, so it is returned as a promise: the page
 * renders at once and shows skeletons until the figures arrive.
 */
export function energyOverviewLoader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const carrier = summaryViewSchema.catch("electricity").parse(params.get("carrier") ?? undefined);
  const period = energyPeriodSchema.catch("month").parse(params.get("period") ?? undefined);
  const today = todayIn();
  const requested = params.get("date");
  const date = periodStart(period, requested && DATE_PATTERN.test(requested) ? requested : today);
  const overview: Promise<EnergyOverview> = Promise.all([fetchEnergySummary(period, date, carrier), fetchEnergySetup()]).then(
    ([summary, setup]) => ({ summary, setup }),
  );
  return { carrier, period, date, today, overview };
}

export type EnergyOverviewData = ReturnType<typeof energyOverviewLoader>;

/** Runs one intent of a form: validates with `schema`, then creates or updates. */
async function save<T>(
  formData: FormData,
  schema: Parameters<typeof parseForm>[0],
  intent: string,
  create: (data: T) => Promise<unknown>,
  update: (id: string, data: T) => Promise<unknown>,
): Promise<EnergyActionResult> {
  const { data, errors } = parseForm(schema, formData);
  if (errors) return { errors, intent };
  const id = String(formData.get("id") ?? "");
  await (id ? update(id, data as T) : create(data as T));
  return { ok: true, intent };
}

async function runAction<T extends EnergyActionResult | Response>(intent: string, run: () => Promise<T>): Promise<T | EnergyActionResult> {
  try {
    return await run();
  } catch (error) {
    const result = toFormResult(error);
    if (result.errors?.parentApplianceId) result.errors.parentApplianceId = result.errors.parentApplianceId.map((message) =>
      ["unknownParent", "meterCycle", "parentCarrierMismatch"].includes(message) ? i18n.t(`energy:hierarchy.errors.${message}`) : message);
    return { ...result, intent };
  }
}

// Appliances -----------------------------------------------------------------------------------------------

export async function appliancesLoader() {
  // Places are optional: appliances still work if the places feature has nothing yet.
  const [appliances, places] = await Promise.all([fetchAppliances(), fetchPlaces().catch((): Place[] => [])]);
  return { appliances, places };
}

export type AppliancesData = Awaited<ReturnType<typeof appliancesLoader>>;

export async function applianceDetailLoader({ params }: LoaderFunctionArgs) {
  try {
    const [appliance, appliances, places, readings] = await Promise.all([
      fetchAppliance(params.applianceId ?? ""), fetchAppliances(), fetchPlaces().catch((): Place[] => []), fetchEnergyData(),
    ]);
    const meters = readings.meters.filter((meter) => meter.applianceId === appliance.id);
    return { appliance, appliances, places, meters };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

export async function appliancesAction({ request }: ActionFunctionArgs): Promise<EnergyActionResult | Response> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");
  return runAction(intent, async () => {
    if (intent === "delete") {
      await deleteAppliance(String(formData.get("id") ?? ""));
      if (formData.get("redirectTo") === "/energy/appliances") return redirect("/energy/appliances");
      return { ok: true, intent };
    }
    if (formData.get("parentApplianceId") === "__independent__") formData.delete("parentApplianceId");
    const { data, errors } = parseForm(applianceInputSchema, formData);
    if (errors) return { errors, intent };
    // The form's explicit Independent choice clears the edge; omission by older clients preserves it.
    if (!formData.has("parentApplianceId") && formData.get("hierarchyIncluded") === "1") data.parentApplianceId = null;
    const id = String(formData.get("id") ?? "");
    await (id ? updateAppliance(id, data) : createAppliance(data));
    return { ok: true, intent };
  });
}

// Solar and battery ---------------------------------------------------------------------------------------

export const energySetupLoader = () => fetchEnergySetup();

export async function energySetupAction({ request }: ActionFunctionArgs): Promise<EnergyActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  return runAction(intent, async () => {
    switch (intent) {
      case "save-solar":
        return save(formData, solarInstallationInputSchema, intent, createSolarInstallation, updateSolarInstallation);
      case "save-battery":
        return save(formData, batteryFormSchema, intent, createBattery, updateBattery);
      case "save-gas-settings": {
        const { data, errors } = parseForm(energySettingsFormSchema, formData);
        if (errors) return { errors, intent };
        await saveEnergySettings(data);
        return { ok: true, intent };
      }
      case "delete-solar":
        await deleteSolarInstallation(id);
        return { ok: true, intent };
      case "delete-battery":
        await deleteBattery(id);
        return { ok: true, intent };
      default:
        return { formError: "Unknown action", intent };
    }
  });
}

// Import and readings -------------------------------------------------------------------------------------

export async function energyImportLoader() {
  const [data, appliances, setup] = await Promise.all([fetchEnergyData(), fetchAppliances(), fetchEnergySetup()]);
  return { data, appliances, settings: setup.settings };
}

export type EnergyImportData = Awaited<ReturnType<typeof energyImportLoader>>;

export async function energyImportAction({ request }: ActionFunctionArgs): Promise<EnergyActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  return runAction(intent, async () => {
    if (intent === "delete-reading") {
      await deleteReading(String(formData.get("id") ?? ""));
      return { ok: true, intent };
    }
    // Fluvius uploads post straight to the API from the import panel; this route only revalidates after.
    if (intent === "revalidate") return { ok: true, intent };
    const { data, errors } = parseForm(meterReadingFormSchema, formData);
    if (errors) return { errors, intent };
    await createReading(data);
    return { ok: true, intent };
  });
}

export async function energyMeterLoader({ params, request }: LoaderFunctionArgs) {
  try {
    const query = new URL(request.url).searchParams;
    const search = new URLSearchParams();
    if (query.has("page")) search.set("page", query.get("page")!);
    const [detail, appliances] = await Promise.all([fetchEnergyMeterDetail(params.meterId!, `?${search}`), fetchAppliances()]);
    return { detail, appliances };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

export async function energySourceLoader({ params }: LoaderFunctionArgs) {
  const [setup, data] = await Promise.all([fetchEnergySetup(), fetchEnergyData()]);
  const solar = setup.solarInstallations.find((row) => row.id === params.solarId) ?? null;
  const battery = setup.batteries.find((row) => row.id === params.batteryId) ?? null;
  if (!solar && !battery) throw new Response(null, { status: 404 });
  const meters = data.meters.filter((row) => solar ? row.solarInstallationId === solar.id : row.batteryId === battery!.id);
  return { solar, battery, meters };
}
export async function energySourceAction(args: ActionFunctionArgs) {
  const result = await energySetupAction(args);
  if (result.ok && (result.intent === "delete-solar" || result.intent === "delete-battery")) return redirect("/energy/setup");
  return result;
}
