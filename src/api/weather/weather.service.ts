import {
  DEFAULT_WEATHER_PROVIDER,
  weatherProviderIdSchema,
  type WeatherDelivery,
  type WeatherProviderId,
  type WeatherResponse,
  type WeatherSettings,
  type WeatherSettingsInput,
} from "@/features/weather/types/weather";
import { getHomeLocation } from "../household/household-settings.service";
import { db } from "../lib/db";
import { badRequest } from "../lib/http";
import { WEATHER_PROVIDERS, weatherProviderInfos, type ProviderForecast } from "./providers";

/*
 * Forecast cache, in memory: one entry per provider and rounded location (2 decimals ≈ 1 km, which is
 * also all we send out). Fresh for 30 minutes. When the chosen provider fails (or isn't configured),
 * Open-Meteo stands in and the response says so (`fallbackFrom`); when everything fails, an older
 * forecast is served as `stale` for up to 6 hours. Concurrent requests share one outbound call, and a
 * failing provider is retried at most once a minute.
 */
const FRESH_MS = 30 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;

type Entry = { forecast: ProviderForecast; at: number };
const cache = new Map<string, Entry>();
const failures = new Map<string, number>();
const inFlight = new Map<string, Promise<Entry>>();
/** What each household saw last, for the settings page. */
const deliveries = new Map<string, WeatherDelivery>();

const keyOf = (provider: WeatherProviderId, latitude: number, longitude: number) =>
  `${provider}:${latitude.toFixed(2)},${longitude.toFixed(2)}`;

/** A fresh forecast from one provider: cached, else fetched (unless it failed less than a minute ago). */
async function fresh(provider: WeatherProviderId, latitude: number, longitude: number): Promise<Entry | null> {
  const key = keyOf(provider, latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached;
  if (!WEATHER_PROVIDERS[provider].isConfigured()) return null;
  const failedAt = failures.get(key);
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_MS) return null;

  let running = inFlight.get(key);
  if (!running) {
    running = WEATHER_PROVIDERS[provider]
      .fetchForecast(latitude, longitude)
      .then((forecast) => {
        const entry = { forecast, at: Date.now() };
        cache.set(key, entry);
        failures.delete(key);
        return entry;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, running);
  }
  try {
    return await running;
  } catch (error) {
    failures.set(key, Date.now());
    console.warn(`Weather (${provider}): ${error instanceof Error ? error.message : "refresh failed"}`);
    return null;
  }
}

function stale(provider: WeatherProviderId, latitude: number, longitude: number): Entry | null {
  const cached = cache.get(keyOf(provider, latitude, longitude));
  return cached && Date.now() - cached.at < STALE_MS ? cached : null;
}

/** The forecast from `provider` for the coordinates, falling back to Open-Meteo, then to older data. */
export async function forecastFor(provider: WeatherProviderId, latitude: number, longitude: number): Promise<WeatherResponse> {
  const fallback = DEFAULT_WEATHER_PROVIDER;
  const respond = (entry: Entry, from: WeatherProviderId, isStale: boolean): WeatherResponse => ({
    status: "ok",
    forecast: { ...entry.forecast, provider: from, fallbackFrom: from === provider ? null : provider, stale: isStale },
  });

  const chosen = await fresh(provider, latitude, longitude);
  if (chosen) return respond(chosen, provider, false);
  if (provider !== fallback) {
    const standIn = await fresh(fallback, latitude, longitude);
    if (standIn) return respond(standIn, fallback, false);
  }
  const old = stale(provider, latitude, longitude);
  if (old) return respond(old, provider, true);
  const oldFallback = provider !== fallback ? stale(fallback, latitude, longitude) : null;
  if (oldFallback) return respond(oldFallback, fallback, true);
  return { status: "unavailable" };
}

async function chosenProvider(householdId: string): Promise<WeatherProviderId> {
  const row = await db.weatherSettings.findUnique({ where: { householdId } });
  const parsed = weatherProviderIdSchema.safeParse(row?.providerId);
  return parsed.success ? parsed.data : DEFAULT_WEATHER_PROVIDER;
}

/** `GET /api/weather`: the forecast for the household's home, or why there is none. */
export async function getHouseholdWeather(householdId: string): Promise<WeatherResponse> {
  const location = await getHomeLocation(householdId);
  if (!location) return { status: "no_location" };
  const response = await forecastFor(await chosenProvider(householdId), location.latitude, location.longitude);
  if (response.status === "ok") {
    const { provider, fallbackFrom, fetchedAt } = response.forecast;
    deliveries.set(householdId, { provider, fallbackFrom, fetchedAt });
  }
  return response;
}

export async function getWeatherSettings(householdId: string): Promise<WeatherSettings> {
  return {
    providerId: await chosenProvider(householdId),
    providers: weatherProviderInfos(),
    last: deliveries.get(householdId) ?? null,
  };
}

/** Chooses the provider. One that isn't configured on this server can't be chosen. */
export async function saveWeatherSettings(householdId: string, input: WeatherSettingsInput): Promise<WeatherSettings> {
  if (!WEATHER_PROVIDERS[input.providerId].isConfigured()) {
    throw badRequest("This weather provider isn't configured on the server", { providerId: ["not_configured"] });
  }
  await db.weatherSettings.upsert({
    where: { householdId },
    create: { householdId, providerId: input.providerId },
    update: { providerId: input.providerId },
  });
  deliveries.delete(householdId);
  return getWeatherSettings(householdId);
}

/** Tests only. */
export function clearWeatherCache() {
  cache.clear();
  failures.clear();
  inFlight.clear();
  deliveries.clear();
}
