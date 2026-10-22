import { WEATHER_ATTRIBUTIONS, weatherCondition, type WeatherDay, type WeatherHour } from "@/features/weather/types/weather";
import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";
import { OutboundError, fetchJsonFromFixedHost } from "../../lib/fixed-host-fetch";
import { FORECAST_DAYS, FORECAST_HOURS, round1, type ProviderForecast, type WeatherProvider } from "./provider";

/*
 * Open-Meteo forecast API (https://open-meteo.com/en/docs): free for non-commercial use, no key, fair
 * use < 10 000 calls a day; attribution "Weather data by Open-Meteo.com" (CC BY 4.0). One call gives
 * current conditions, hourly and daily values in the household time zone, with WMO weather codes.
 * The default provider, and the fallback when the chosen one fails.
 */

const HOST = "api.open-meteo.com";

const CURRENT = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
] as const;
const HOURLY = ["temperature_2m", "precipitation_probability", "precipitation", "weather_code", "is_day"] as const;
const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "sunrise",
  "sunset",
] as const;

export function forecastUrl(latitude: number, longitude: number): string {
  const url = new URL(`https://${HOST}/v1/forecast`);
  url.searchParams.set("latitude", latitude.toFixed(2));
  url.searchParams.set("longitude", longitude.toFixed(2));
  url.searchParams.set("current", CURRENT.join(","));
  url.searchParams.set("hourly", HOURLY.join(","));
  url.searchParams.set("daily", DAILY.join(","));
  url.searchParams.set("timezone", HOUSEHOLD_TIME_ZONE);
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("wind_speed_unit", "kmh");
  return url.toString();
}

type Series = Record<string, (number | string | null)[] | undefined>;
export type OpenMeteoResponse = {
  latitude?: number;
  longitude?: number;
  current?: Record<string, number | string | null | undefined>;
  hourly?: Series & { time?: string[] };
  daily?: Series & { time?: string[] };
};

const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const numOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The hour slot (`YYYY-MM-DDTHH:00`) a local time falls in. */
const hourSlot = (time: string) => `${time.slice(0, 13)}:00`;

/**
 * Turns an Open-Meteo response into our contract. Throws when the essential parts are missing; tolerates
 * missing optional series (precipitation probability can be null for some models).
 */
export function parseOpenMeteo(body: OpenMeteoResponse, fetchedAt: Date): ProviderForecast {
  const current = body.current;
  const hourly = body.hourly;
  const daily = body.daily;
  if (!current || typeof current.time !== "string" || !hourly?.time || !daily?.time) {
    throw new OutboundError("Open-Meteo sent an incomplete forecast");
  }

  const start = Math.max(0, hourly.time.indexOf(hourSlot(current.time)));
  const hours: WeatherHour[] = hourly.time.slice(start, start + FORECAST_HOURS).map((time, offset) => {
    const index = start + offset;
    return {
      time,
      temperature: round1(num(hourly.temperature_2m?.[index])),
      precipitation: round1(num(hourly.precipitation?.[index])),
      precipitationProbability: numOrNull(hourly.precipitation_probability?.[index]),
      condition: weatherCondition(num(hourly.weather_code?.[index])),
      isDay: num(hourly.is_day?.[index], 1) === 1,
    };
  });

  const days: WeatherDay[] = daily.time.map((date, index) => {
    const sunrise = daily.sunrise?.[index];
    const sunset = daily.sunset?.[index];
    const wind = numOrNull(daily.wind_speed_10m_max?.[index]);
    return {
      date,
      condition: weatherCondition(num(daily.weather_code?.[index])),
      temperatureMax: round1(num(daily.temperature_2m_max?.[index])),
      temperatureMin: round1(num(daily.temperature_2m_min?.[index])),
      precipitationSum: round1(num(daily.precipitation_sum?.[index])),
      precipitationProbability: numOrNull(daily.precipitation_probability_max?.[index]),
      windSpeedMax: wind === null ? null : Math.round(wind),
      sunrise: typeof sunrise === "string" ? sunrise : null,
      sunset: typeof sunset === "string" ? sunset : null,
    };
  });
  if (days.length === 0) throw new OutboundError("Open-Meteo sent no daily forecast");

  return {
    latitude: num(body.latitude),
    longitude: num(body.longitude),
    fetchedAt: fetchedAt.toISOString(),
    current: {
      time: current.time,
      temperature: round1(num(current.temperature_2m)),
      apparentTemperature: round1(num(current.apparent_temperature)),
      humidity: Math.round(num(current.relative_humidity_2m)),
      precipitation: round1(num(current.precipitation)),
      condition: weatherCondition(num(current.weather_code)),
      isDay: num(current.is_day, 1) === 1,
      windSpeed: Math.round(num(current.wind_speed_10m)),
      windGusts: Math.round(num(current.wind_gusts_10m)),
      windDirection: Math.round(num(current.wind_direction_10m)),
    },
    hours,
    days,
  };
}

export const openMeteoProvider: WeatherProvider = {
  info: {
    id: "open-meteo",
    name: "Open-Meteo",
    website: "https://open-meteo.com/",
    attribution: WEATHER_ATTRIBUTIONS["open-meteo"],
    unofficial: false,
  },
  isConfigured: () => true,
  async fetchForecast(latitude, longitude) {
    const body = await fetchJsonFromFixedHost<OpenMeteoResponse>(forecastUrl(latitude, longitude), {
      allowedHosts: [HOST],
      timeoutMs: 8_000,
      maxBytes: 500_000,
    });
    return parseOpenMeteo(body, new Date());
  },
};
