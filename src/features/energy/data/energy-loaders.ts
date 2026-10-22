import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
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
  fetchEnergyData,
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

async function runAction(intent: string, run: () => Promise<EnergyActionResult>): Promise<EnergyActionResult> {
  try {
    return await run();
  } catch (error) {
    return { ...toFormResult(error), intent };
  }
}

// Appliances -----------------------------------------------------------------------------------------------

export async function appliancesLoader() {
  // Places are optional: appliances still work if the places feature has nothing yet.
  const [appliances, places] = await Promise.all([fetchAppliances(), fetchPlaces().catch((): Place[] => [])]);
  return { appliances, places };
}

export type AppliancesData = Awaited<ReturnType<typeof appliancesLoader>>;

export async function appliancesAction({ request }: ActionFunctionArgs): Promise<EnergyActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "save");
  return runAction(intent, async () => {
    if (intent === "delete") {
      await deleteAppliance(String(formData.get("id") ?? ""));
      return { ok: true, intent };
    }
    return save(formData, applianceInputSchema, intent, createAppliance, updateAppliance);
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
