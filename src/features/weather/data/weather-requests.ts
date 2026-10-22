import i18n from "i18next";
import { api } from "@/lib/api-client";
import { toFormResult, type FormResult } from "@/lib/forms";
import { weatherSettingsInputSchema, type WeatherResponse, type WeatherSettings, type WeatherSettingsInput } from "../types/weather";

/** The home's forecast; `{ status: "no_location" }` until the address is set in Settings. */
export const fetchWeather = () => api.get<WeatherResponse>("/weather");
export const fetchWeatherSettings = () => api.get<WeatherSettings>("/weather/settings");
export const saveWeatherSettings = (input: WeatherSettingsInput) => api.put<WeatherSettings>("/weather/settings", input);

/** Intent of the weather provider form, for the route action that hosts it (Settings). */
export const WEATHER_SETTINGS_INTENT = "weather-provider";

export type WeatherSettingsActionResult = FormResult & { intent: typeof WEATHER_SETTINGS_INTENT };

/** Saves the chosen provider. Call it from the hosting route's action. */
export async function submitWeatherSettings(formData: FormData): Promise<WeatherSettingsActionResult> {
  const intent = WEATHER_SETTINGS_INTENT;
  const parsed = weatherSettingsInputSchema.safeParse({ providerId: formData.get("providerId") });
  if (!parsed.success) return { formError: i18n.t("common:errors.generic"), intent };
  try {
    await saveWeatherSettings(parsed.data);
    return { ok: true, intent };
  } catch (error) {
    return { ...toFormResult(error), intent };
  }
}
