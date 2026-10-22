import i18n from "i18next";
import { api } from "@/lib/api-client";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  householdSettingsInputSchema,
  type GeocodeOutcome,
  type HouseholdSettings,
  type HouseholdSettingsInput,
  type HouseholdSettingsResult,
} from "../types/household-settings";

export const fetchHouseholdSettings = () => api.get<HouseholdSettings>("/household/settings");
export const saveHouseholdSettings = (input: HouseholdSettingsInput) =>
  api.put<HouseholdSettingsResult>("/household/settings", input);

/** Intent of the household settings form, for the route action that hosts it (Settings). */
export const HOUSEHOLD_SETTINGS_INTENT = "household-settings";

export type HouseholdSettingsActionResult = FormResult & {
  intent: typeof HOUSEHOLD_SETTINGS_INTENT;
  geocode?: GeocodeOutcome;
};

/** Validates and saves the household settings form. Call it from the hosting route's action. */
export async function submitHouseholdSettings(formData: FormData): Promise<HouseholdSettingsActionResult> {
  const intent = HOUSEHOLD_SETTINGS_INTENT;
  const { data, errors } = parseForm(householdSettingsInputSchema, formData);
  if (errors) return { errors, intent };
  try {
    const result = await saveHouseholdSettings(data);
    return { ok: true, intent, geocode: result.geocode };
  } catch (error) {
    return { ...toFormResult(error, { forbidden: i18n.t("household:settings.forbidden") }), intent };
  }
}
