import { z } from "zod";

/**
 * Weather forecast for the home, from the household's chosen provider (Open-Meteo by default, KMI/IRM or
 * Google), normalised by the adapters in src/api/weather/providers. The API fetches and caches it; this
 * file is the contract of `/api/weather` plus pure helpers shared by the API, the cards and the tests.
 * Units are metric: °C, km/h, mm. Times are local wall-clock times in the household time zone
 * (`YYYY-MM-DDTHH:MM`).
 */

// ── Providers ─────────────────────────────────────────────────────────────────────────────────────────

/** Provider ids. Open-Meteo is the default and the fallback when the chosen provider fails. */
export const WEATHER_PROVIDER_IDS = ["open-meteo", "kmi", "google"] as const;
export const weatherProviderIdSchema = z.enum(WEATHER_PROVIDER_IDS);
export type WeatherProviderId = z.infer<typeof weatherProviderIdSchema>;
export const DEFAULT_WEATHER_PROVIDER: WeatherProviderId = "open-meteo";

export type WeatherProviderInfo = {
  id: WeatherProviderId;
  name: string;
  website: string;
  /** Credit to show next to its data. */
  attribution: { label: string; url: string };
  /** False when the server lacks what it needs (Google without an API key). */
  available: boolean;
  unavailableReason: "not_configured" | null;
  /** Uses an undocumented app API that may change without notice (KMI). */
  unofficial: boolean;
};

/** Body of `PUT /api/weather/settings`. */
export const weatherSettingsInputSchema = z.object({ providerId: weatherProviderIdSchema });
export type WeatherSettingsInput = z.infer<typeof weatherSettingsInputSchema>;

/** Which provider delivered the forecast the household saw last. */
export type WeatherDelivery = {
  provider: WeatherProviderId;
  /** The chosen provider that failed, when Open-Meteo stood in. */
  fallbackFrom: WeatherProviderId | null;
  fetchedAt: string;
};

/** `GET /api/weather/settings`. */
export type WeatherSettings = {
  providerId: WeatherProviderId;
  providers: WeatherProviderInfo[];
  last: WeatherDelivery | null;
};

// ── Conditions ────────────────────────────────────────────────────────────────────────────────────────

/** What we show, whatever the provider's own codes are. */
export const WEATHER_CONDITIONS = [
  "clear",
  "mostly_clear",
  "partly_cloudy",
  "overcast",
  "fog",
  "drizzle",
  "freezing_drizzle",
  "rain",
  "heavy_rain",
  "freezing_rain",
  "rain_showers",
  "sleet",
  "snow",
  "snow_showers",
  "thunderstorm",
  "thunderstorm_hail",
  "unknown",
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

/** Maps a WMO code (0–99, Open-Meteo `weather_code`) to a condition. Unknown codes map to `"unknown"`. */
export function weatherCondition(code: number): WeatherCondition {
  switch (code) {
    case 0:
      return "clear";
    case 1:
      return "mostly_clear";
    case 2:
      return "partly_cloudy";
    case 3:
      return "overcast";
    case 45:
    case 48:
      return "fog";
    case 51:
    case 53:
    case 55:
      return "drizzle";
    case 56:
    case 57:
      return "freezing_drizzle";
    case 61:
    case 63:
      return "rain";
    case 65:
      return "heavy_rain";
    case 66:
    case 67:
      return "freezing_rain";
    case 80:
    case 81:
    case 82:
      return "rain_showers";
    case 71:
    case 73:
    case 75:
    case 77:
      return "snow";
    case 85:
    case 86:
      return "snow_showers";
    case 95:
      return "thunderstorm";
    case 96:
    case 99:
      return "thunderstorm_hail";
    default:
      return "unknown";
  }
}

export type WeatherCurrent = {
  /** Local time of the observation, `YYYY-MM-DDTHH:MM`. */
  time: string;
  temperature: number;
  /** `null` when the provider has none (KMI). */
  apparentTemperature: number | null;
  /** Relative humidity, %; `null` when the provider has none. */
  humidity: number | null;
  /** Precipitation in the last hour, mm. */
  precipitation: number;
  condition: WeatherCondition;
  isDay: boolean;
  /** km/h */
  windSpeed: number;
  windGusts: number | null;
  /** Degrees, where the wind comes from (0 = north). */
  windDirection: number;
};

export type WeatherHour = {
  /** Local `YYYY-MM-DDTHH:MM`. */
  time: string;
  temperature: number;
  /** mm in this hour. */
  precipitation: number;
  /** %, `null` when the model has none. */
  precipitationProbability: number | null;
  condition: WeatherCondition;
  isDay: boolean;
};

export type WeatherDay = {
  /** `YYYY-MM-DD` */
  date: string;
  condition: WeatherCondition;
  temperatureMax: number;
  temperatureMin: number;
  /** mm over the day. */
  precipitationSum: number;
  /** Highest hourly chance of precipitation, %; `null` when unknown. */
  precipitationProbability: number | null;
  /** km/h; `null` when unknown. */
  windSpeedMax: number | null;
  /** Local `YYYY-MM-DDTHH:MM`. */
  sunrise: string | null;
  sunset: string | null;
};

export type WeatherForecast = {
  /** Who delivered this forecast. */
  provider: WeatherProviderId;
  /** The household's chosen provider when it failed and Open-Meteo stood in, else `null`. */
  fallbackFrom: WeatherProviderId | null;
  /** Coordinates the forecast is for (rounded to ~1 km before leaving the server). */
  latitude: number;
  longitude: number;
  /** When it was fetched from Open-Meteo (ISO). */
  fetchedAt: string;
  /** True when the latest refresh failed and an older forecast is shown. */
  stale: boolean;
  current: WeatherCurrent;
  /** The next 12 hours, starting with the current hour. */
  hours: WeatherHour[];
  /** Today first, then the next days (7 in total). */
  days: WeatherDay[];
};

/** `GET /api/weather`: the forecast, or why there is none. */
export type WeatherResponse =
  | { status: "ok"; forecast: WeatherForecast }
  /** The household has no coordinates yet: set the address in Settings. */
  | { status: "no_location" }
  /** Open-Meteo could not be reached and nothing is cached. */
  | { status: "unavailable" };

/** Credit per provider: Open-Meteo asks for it (CC BY 4.0); KMI and Google are named as the source. */
export const WEATHER_ATTRIBUTIONS: Record<WeatherProviderId, { label: string; url: string }> = {
  "open-meteo": { label: "Open-Meteo.com", url: "https://open-meteo.com/" },
  kmi: { label: "KMI/IRM", url: "https://www.meteo.be/" },
  google: { label: "Google", url: "https://developers.google.com/maps/documentation/weather" },
};

/** Display names of the providers. */
export const WEATHER_PROVIDER_NAMES: Record<WeatherProviderId, string> = {
  "open-meteo": "Open-Meteo",
  kmi: "KMI/IRM",
  google: "Google Weather",
};

/** Rain at or above this (mm/h), or a chance at or above `RAIN_CHANCE`, counts as "rain expected". */
export const RAIN_MM = 0.2;
export const RAIN_CHANCE = 50;

export type RainOutlook =
  /** Dry for the hours given. */
  | { kind: "dry" }
  /** Raining now (this hour); `until` is the first dry hour, `null` if it lasts all hours given. */
  | { kind: "now"; until: string | null; total: number }
  /** Rain from `from`, with the total over the hours given. */
  | { kind: "later"; from: string; total: number };

const isWet = (hour: Pick<WeatherHour, "precipitation" | "precipitationProbability">) =>
  hour.precipitation >= RAIN_MM || (hour.precipitationProbability ?? 0) >= RAIN_CHANCE;

/** Summarises the next hours: dry, raining now (until when), or rain from a given hour. */
export function rainOutlook(hours: WeatherHour[]): RainOutlook {
  const total = Math.round(hours.reduce((sum, hour) => sum + hour.precipitation, 0) * 10) / 10;
  const first = hours.findIndex(isWet);
  if (first === -1) return { kind: "dry" };
  if (first === 0) {
    const dry = hours.findIndex((hour) => !isWet(hour));
    return { kind: "now", until: dry === -1 ? null : (hours[dry]?.time ?? null), total };
  }
  return { kind: "later", from: hours[first]?.time ?? "", total };
}

/** Compass point (8 directions) the wind comes from: `"N"`, `"NE"`, … */
export function windCompass(degrees: number): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8] ?? "N";
}

/** Adults and owners pick the weather provider; everyone sees the forecast. Mirrors the API's role check. */
export const canManageWeather = (role: "owner" | "adult" | "child") => role !== "child";
