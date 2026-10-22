import { WEATHER_ATTRIBUTIONS, type WeatherCondition, type WeatherDay, type WeatherHour } from "@/features/weather/types/weather";
import { config } from "../../lib/config";
import { OutboundError, fetchJsonFromFixedHost } from "../../lib/fixed-host-fetch";
import { FORECAST_DAYS, FORECAST_HOURS, localDateTime, numberOrNull, round1, type ProviderForecast, type WeatherProvider } from "./provider";

/*
 * Google Maps Platform Weather API (https://developers.google.com/maps/documentation/weather): needs an
 * API key with the Weather API enabled and billing on the Google Cloud project. The key is read from
 * `GOOGLE_MAPS_API_KEY` on the server and never reaches the browser; error messages never contain URLs.
 *
 *   GET https://weather.googleapis.com/v1/currentConditions:lookup?key&location.latitude&location.longitude
 *   GET https://weather.googleapis.com/v1/forecast/hours:lookup?…&hours=12&pageSize=12
 *   GET https://weather.googleapis.com/v1/forecast/days:lookup?…&days=7&pageSize=7
 *
 * Metric units by default (°C, km/h, mm). `weatherCondition.type` is Google's own enum.
 */

const HOST = "weather.googleapis.com";

/** Google's `weatherCondition.type` → our conditions. Unknown types map to `"unknown"`. */
export function googleCondition(type: string | undefined): WeatherCondition {
  switch (type) {
    case "CLEAR":
      return "clear";
    case "MOSTLY_CLEAR":
      return "mostly_clear";
    case "PARTLY_CLOUDY":
      return "partly_cloudy";
    case "MOSTLY_CLOUDY":
    case "CLOUDY":
    case "WINDY":
      return "overcast";
    case "LIGHT_RAIN":
    case "LIGHT_TO_MODERATE_RAIN":
    case "RAIN":
    case "WIND_AND_RAIN":
      return "rain";
    case "MODERATE_TO_HEAVY_RAIN":
    case "HEAVY_RAIN":
    case "RAIN_PERIODICALLY_HEAVY":
      return "heavy_rain";
    case "LIGHT_RAIN_SHOWERS":
    case "CHANCE_OF_SHOWERS":
    case "SCATTERED_SHOWERS":
    case "RAIN_SHOWERS":
    case "HEAVY_RAIN_SHOWERS":
      return "rain_showers";
    case "RAIN_AND_SNOW":
      return "sleet";
    case "LIGHT_SNOW_SHOWERS":
    case "CHANCE_OF_SNOW_SHOWERS":
    case "SCATTERED_SNOW_SHOWERS":
    case "SNOW_SHOWERS":
    case "HEAVY_SNOW_SHOWERS":
      return "snow_showers";
    case "LIGHT_TO_MODERATE_SNOW":
    case "MODERATE_TO_HEAVY_SNOW":
    case "SNOW":
    case "LIGHT_SNOW":
    case "HEAVY_SNOW":
    case "SNOWSTORM":
    case "SNOW_PERIODICALLY_HEAVY":
    case "HEAVY_SNOW_STORM":
    case "BLOWING_SNOW":
      return "snow";
    case "HAIL":
    case "HAIL_SHOWERS":
      return "freezing_rain";
    case "THUNDERSTORM":
    case "THUNDERSHOWER":
    case "LIGHT_THUNDERSTORM_RAIN":
    case "SCATTERED_THUNDERSTORMS":
    case "HEAVY_THUNDERSTORM":
      return "thunderstorm";
    default:
      return "unknown";
  }
}

type Value = { degrees?: number; value?: number; quantity?: number; percent?: number };
type Precipitation = { probability?: Value; qpf?: Value };
type Wind = { direction?: { degrees?: number }; speed?: Value; gust?: Value };
type Condition = { type?: string };

export type GoogleCurrent = {
  currentTime?: string;
  isDaytime?: boolean;
  weatherCondition?: Condition;
  temperature?: Value;
  feelsLikeTemperature?: Value;
  relativeHumidity?: number;
  precipitation?: Precipitation;
  wind?: Wind;
};
export type GoogleHours = {
  forecastHours?: {
    interval?: { startTime?: string };
    displayDateTime?: { year?: number; month?: number; day?: number; hours?: number };
    isDaytime?: boolean;
    weatherCondition?: Condition;
    temperature?: Value;
    precipitation?: Precipitation;
  }[];
};
type GoogleDayPart = { weatherCondition?: Condition; precipitation?: Precipitation; wind?: Wind };
export type GoogleDays = {
  forecastDays?: {
    displayDate?: { year?: number; month?: number; day?: number };
    daytimeForecast?: GoogleDayPart;
    nighttimeForecast?: GoogleDayPart;
    maxTemperature?: Value;
    minTemperature?: Value;
    sunEvents?: { sunriseTime?: string; sunsetTime?: string };
  }[];
};

const pad = (value: number | undefined) => String(value ?? 0).padStart(2, "0");
const ymd = (date: { year?: number; month?: number; day?: number } | undefined) =>
  date?.year ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : null;

/** Turns the three Google responses into our contract. */
export function parseGoogle(
  current: GoogleCurrent,
  hourly: GoogleHours,
  daily: GoogleDays,
  latitude: number,
  longitude: number,
  fetchedAt: Date,
): ProviderForecast {
  const temperature = numberOrNull(current.temperature?.degrees);
  if (temperature === null || !hourly.forecastHours?.length || !daily.forecastDays?.length) {
    throw new OutboundError("Google sent an incomplete forecast");
  }

  const hours: WeatherHour[] = hourly.forecastHours.slice(0, FORECAST_HOURS).flatMap((hour) => {
    const date = ymd(hour.displayDateTime);
    const time = date ? `${date}T${pad(hour.displayDateTime?.hours)}:00` : hour.interval?.startTime ? localDateTime(hour.interval.startTime) : null;
    if (!time) return [];
    return [
      {
        time,
        temperature: round1(numberOrNull(hour.temperature?.degrees) ?? 0),
        precipitation: round1(numberOrNull(hour.precipitation?.qpf?.quantity) ?? 0),
        precipitationProbability: numberOrNull(hour.precipitation?.probability?.percent),
        condition: googleCondition(hour.weatherCondition?.type),
        isDay: hour.isDaytime !== false,
      },
    ];
  });

  const days: WeatherDay[] = daily.forecastDays.slice(0, FORECAST_DAYS).flatMap((day) => {
    const date = ymd(day.displayDate);
    if (!date) return [];
    const parts = [day.daytimeForecast, day.nighttimeForecast];
    const chances = parts.map((part) => numberOrNull(part?.precipitation?.probability?.percent)).filter((value): value is number => value !== null);
    const winds = parts.map((part) => numberOrNull(part?.wind?.speed?.value)).filter((value): value is number => value !== null);
    const amount = parts.reduce((sum, part) => sum + (numberOrNull(part?.precipitation?.qpf?.quantity) ?? 0), 0);
    return [
      {
        date,
        condition: googleCondition((day.daytimeForecast ?? day.nighttimeForecast)?.weatherCondition?.type),
        temperatureMax: round1(numberOrNull(day.maxTemperature?.degrees) ?? 0),
        temperatureMin: round1(numberOrNull(day.minTemperature?.degrees) ?? 0),
        precipitationSum: round1(amount),
        precipitationProbability: chances.length ? Math.max(...chances) : null,
        windSpeedMax: winds.length ? Math.round(Math.max(...winds)) : null,
        sunrise: day.sunEvents?.sunriseTime ? localDateTime(day.sunEvents.sunriseTime) : null,
        sunset: day.sunEvents?.sunsetTime ? localDateTime(day.sunEvents.sunsetTime) : null,
      },
    ];
  });

  const feelsLike = numberOrNull(current.feelsLikeTemperature?.degrees);
  const gusts = numberOrNull(current.wind?.gust?.value);
  return {
    latitude,
    longitude,
    fetchedAt: fetchedAt.toISOString(),
    current: {
      time: (current.currentTime && localDateTime(current.currentTime)) || hours[0]?.time || localDateTime(fetchedAt) || "",
      temperature: round1(temperature),
      apparentTemperature: feelsLike === null ? null : round1(feelsLike),
      humidity: numberOrNull(current.relativeHumidity),
      precipitation: round1(numberOrNull(current.precipitation?.qpf?.quantity) ?? 0),
      condition: googleCondition(current.weatherCondition?.type),
      isDay: current.isDaytime !== false,
      windSpeed: Math.round(numberOrNull(current.wind?.speed?.value) ?? 0),
      windGusts: gusts === null ? null : Math.round(gusts),
      windDirection: Math.round(numberOrNull(current.wind?.direction?.degrees) ?? 0),
    },
    hours,
    days,
  };
}

export const googleProvider: WeatherProvider = {
  info: {
    id: "google",
    name: "Google Weather",
    website: "https://developers.google.com/maps/documentation/weather",
    attribution: WEATHER_ATTRIBUTIONS.google,
    unofficial: false,
  },
  isConfigured: () => Boolean(config.GOOGLE_MAPS_API_KEY),
  async fetchForecast(latitude, longitude) {
    const key = config.GOOGLE_MAPS_API_KEY;
    if (!key) throw new OutboundError("Google Weather is not configured");
    const lat = Number(latitude.toFixed(2));
    const lon = Number(longitude.toFixed(2));
    const get = <T>(path: string, extra: Record<string, string> = {}) => {
      const url = new URL(`https://${HOST}/v1/${path}`);
      url.searchParams.set("key", key);
      url.searchParams.set("location.latitude", String(lat));
      url.searchParams.set("location.longitude", String(lon));
      for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, value);
      return fetchJsonFromFixedHost<T>(url.toString(), { allowedHosts: [HOST], timeoutMs: 8_000, maxBytes: 1_000_000 });
    };
    const [current, hourly, daily] = await Promise.all([
      get<GoogleCurrent>("currentConditions:lookup"),
      get<GoogleHours>("forecast/hours:lookup", { hours: String(FORECAST_HOURS), pageSize: String(FORECAST_HOURS) }),
      get<GoogleDays>("forecast/days:lookup", { days: String(FORECAST_DAYS), pageSize: String(FORECAST_DAYS) }),
    ]);
    return parseGoogle(current, hourly, daily, lat, lon, new Date());
  },
};
