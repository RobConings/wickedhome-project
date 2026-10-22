import i18n from "i18next";
import type { ActionFunctionArgs } from "react-router";
import {
  HOUSEHOLD_SETTINGS_INTENT,
  fetchHouseholdOverview,
  fetchHouseholdSettings,
  submitHouseholdSettings,
  type HouseholdSettings,
  type HouseholdSettingsActionResult,
  type Habitant,
} from "@/features/household";
import { fetchWasteSettings, isWasteIntent, submitWasteSettings, type WasteActionResult, type WasteSettings } from "@/features/waste";
import {
  WEATHER_SETTINGS_INTENT,
  fetchWeatherSettings,
  submitWeatherSettings,
  type WeatherSettings,
  type WeatherSettingsActionResult,
} from "@/features/weather";
import { todayIn } from "@/types/dates";

/**
 * The settings page composes sections from features. Each section's data is loaded in parallel; one that
 * fails to load (`null`) only shows an error in its own section. Adding a section: load its data here,
 * dispatch its intents in `settingsAction`, render it in `SettingsScreen`.
 */
export type SettingsData = {
  today: string;
  household: HouseholdSettings | null;
  waste: WasteSettings | null;
  weather: WeatherSettings | null;
  /** For sections that pick people (who puts the bins out); empty when they couldn't load. */
  habitants: Habitant[];
};

const settle = <T>(promise: Promise<T>): Promise<T | null> =>
  promise.catch((error: unknown) => {
    console.warn("Settings: a section could not load", error);
    return null;
  });

export async function settingsLoader(): Promise<SettingsData> {
  const [household, waste, weather, overview] = await Promise.all([
    settle(fetchHouseholdSettings()),
    settle(fetchWasteSettings()),
    settle(fetchWeatherSettings()),
    settle(fetchHouseholdOverview()),
  ]);
  return { today: todayIn(), household, waste, weather, habitants: overview?.habitants ?? [] };
}

export type SettingsActionResult =
  | HouseholdSettingsActionResult
  | WasteActionResult
  | WeatherSettingsActionResult
  | { formError: string; intent?: undefined };

/** Every settings form posts here with an `intent`; the owning feature handles it. */
export async function settingsAction({ request }: ActionFunctionArgs): Promise<SettingsActionResult> {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === HOUSEHOLD_SETTINGS_INTENT) return submitHouseholdSettings(formData);
  if (isWasteIntent(intent)) return submitWasteSettings(intent, formData);
  if (intent === WEATHER_SETTINGS_INTENT) return submitWeatherSettings(formData);
  return { formError: i18n.t("common:errors.generic") };
}
