import i18n from "i18next";
import type { ActionFunctionArgs } from "react-router";
import { toFormResult, type FormResult } from "../lib/forms";
import { fetchAppliances, type Appliance } from "@/features/energy";
import { haApplianceLinksInputSchema, haSettingsInputSchema } from "../types/home-assistant";
import {
  fetchAlarmOverview,
  fetchHaEnergy,
  fetchHaEntities,
  fetchHaStatus,
  fetchHaSuggestions,
  saveHaApplianceLinks,
  saveHaSettings,
  startHaEnergyImport,
} from "./home-assistant-requests";

export type HomeAssistantActionResult = FormResult & { intent?: string };

/**
 * The Home Assistant page: the status is awaited (fast, from memory); entities, suggestions, energy and the
 * alarm follow un-awaited, each with its own skeleton.
 */
export async function homeAssistantLoader() {
  const status = await fetchHaStatus();
  return {
    status,
    entities: fetchHaEntities().catch(() => null),
    suggestions: fetchHaSuggestions().catch(() => null),
    energy: fetchHaEnergy().catch(() => null),
    alarm: fetchAlarmOverview(),
    appliances: fetchAppliances().catch((): Appliance[] => []),
  };
}
export type HomeAssistantData = Awaited<ReturnType<typeof homeAssistantLoader>>;

/** JSON submissions; `intent`: save-links · save-settings · import-energy. (The device import calls the API itself.) */
export async function homeAssistantAction({ request }: ActionFunctionArgs): Promise<HomeAssistantActionResult> {
  const body = (await request.json()) as Record<string, unknown>;
  const intent = typeof body.intent === "string" ? body.intent : "";
  try {
    switch (intent) {
      case "save-links": {
        const input = haApplianceLinksInputSchema.safeParse({ links: body.links });
        if (!input.success) return { formError: i18n.t("common:errors.generic"), intent };
        await saveHaApplianceLinks(input.data);
        return { ok: true, intent };
      }
      case "save-settings": {
        const input = haSettingsInputSchema.safeParse(body.settings);
        if (!input.success) return { formError: i18n.t("common:errors.generic"), intent };
        await saveHaSettings(input.data);
        return { ok: true, intent };
      }
      case "import-energy":
        await startHaEnergyImport();
        return { ok: true, intent };
      default:
        return { formError: i18n.t("common:errors.generic"), intent };
    }
  } catch (error) {
    return { ...toFormResult(error, { ha_unavailable: i18n.t("home-assistant:errors.unreachable"), conflict: i18n.t("home-assistant:energy.alreadyRunning") }), intent };
  }
}
