import type { WeatherForecast, WeatherHour, WeatherResponse, WeatherSettings } from "@/features/weather/types/weather";
import { weatherCondition } from "@/features/weather/types/weather";
import { addDays } from "@/types/dates";

/** Same day as the other features' fixtures; the evening, so the next hours run into the night. */
export const WEATHER_TODAY = "2026-10-02";

const pad = (value: number) => String(value).padStart(2, "0");

/** Twelve hours from 19:00: dry this evening, a shower around midnight. */
const hours: WeatherHour[] = Array.from({ length: 12 }, (_, index) => {
  const hour = (19 + index) % 24;
  const date = index < 5 ? WEATHER_TODAY : addDays(WEATHER_TODAY, 1);
  const rain = [0, 0, 0, 0.1, 0.6, 1.2, 0.4, 0, 0, 0, 0, 0][index] ?? 0;
  const chance = [5, 10, 20, 45, 70, 80, 55, 30, 15, 10, 5, 5][index] ?? 0;
  const code = rain >= 1 ? 63 : rain > 0.2 ? 61 : rain > 0 ? 51 : index < 2 ? 2 : 3;
  return {
    time: `${date}T${pad(hour)}:00`,
    temperature: [16.8, 15.9, 15.1, 14.6, 14.2, 13.9, 13.5, 13.2, 12.9, 12.6, 12.4, 12.8][index] ?? 13,
    precipitation: rain,
    precipitationProbability: chance,
    condition: weatherCondition(code),
    isDay: hour >= 8 && hour < 19,
  };
});

const day = (offset: number, code: number, max: number, min: number, rain: number, chance: number, wind: number) => {
  const date = addDays(WEATHER_TODAY, offset);
  return {
    date,
    condition: weatherCondition(code),
    temperatureMax: max,
    temperatureMin: min,
    precipitationSum: rain,
    precipitationProbability: chance,
    windSpeedMax: wind,
    sunrise: `${date}T07:4${offset % 10}`,
    sunset: `${date}T19:1${4 - Math.min(offset, 4)}`,
  };
};

export const forecastFixture: WeatherForecast = {
  provider: "open-meteo",
  fallbackFrom: null,
  latitude: 50.93,
  longitude: 5.34,
  fetchedAt: `${WEATHER_TODAY}T17:20:00.000Z`,
  stale: false,
  current: {
    time: `${WEATHER_TODAY}T19:30`,
    temperature: 16.9,
    apparentTemperature: 15.8,
    humidity: 68,
    precipitation: 0,
    condition: "partly_cloudy",
    isDay: false,
    windSpeed: 14,
    windGusts: 31,
    windDirection: 235,
  },
  hours,
  days: [
    day(0, 61, 19.8, 11.3, 2.3, 80, 22),
    day(1, 80, 16.4, 10.2, 4.1, 65, 28),
    day(2, 3, 15.2, 8.7, 0.2, 20, 15),
    day(3, 1, 17.0, 7.9, 0, 5, 11),
    day(4, 0, 18.3, 8.4, 0, 0, 9),
    day(5, 95, 17.6, 11.0, 7.8, 75, 34),
    day(6, 45, 14.1, 9.5, 0.4, 25, 8),
  ],
};

export const weatherFixture: WeatherResponse = { status: "ok", forecast: forecastFixture };

/** Raining right now, dry from 22:00. */
export const rainingNowFixture: WeatherResponse = {
  status: "ok",
  forecast: {
    ...forecastFixture,
    current: { ...forecastFixture.current, condition: "rain", precipitation: 1.4 },
    hours: hours.map((hour, index) => (index < 3 ? { ...hour, precipitation: 1.1, precipitationProbability: 90, condition: "rain" } : { ...hour, precipitation: 0, precipitationProbability: 10 })),
  },
};

export const staleWeatherFixture: WeatherResponse = { status: "ok", forecast: { ...forecastFixture, stale: true } };
export const noLocationWeatherFixture: WeatherResponse = { status: "no_location" };
export const unavailableWeatherFixture: WeatherResponse = { status: "unavailable" };

/** KMI chosen: no feels-like temperature or gusts in its data. */
export const kmiWeatherFixture: WeatherResponse = {
  status: "ok",
  forecast: {
    ...forecastFixture,
    provider: "kmi",
    current: { ...forecastFixture.current, apparentTemperature: null, humidity: null, windGusts: null },
  },
};

/** KMI was chosen but failed; Open-Meteo stood in. */
export const fallbackWeatherFixture: WeatherResponse = { status: "ok", forecast: { ...forecastFixture, fallbackFrom: "kmi" } };

export const weatherProvidersFixture: WeatherSettings["providers"] = [
  { id: "open-meteo", name: "Open-Meteo", website: "https://open-meteo.com/", attribution: { label: "Open-Meteo.com", url: "https://open-meteo.com/" }, available: true, unavailableReason: null, unofficial: false },
  { id: "kmi", name: "KMI/IRM", website: "https://www.meteo.be/", attribution: { label: "KMI/IRM", url: "https://www.meteo.be/" }, available: true, unavailableReason: null, unofficial: true },
  { id: "google", name: "Google Weather", website: "https://developers.google.com/maps/documentation/weather", attribution: { label: "Google", url: "https://developers.google.com/maps/documentation/weather" }, available: false, unavailableReason: "not_configured", unofficial: false },
];

export const weatherSettingsFixture: WeatherSettings = {
  providerId: "kmi",
  providers: weatherProvidersFixture,
  last: { provider: "kmi", fallbackFrom: null, fetchedAt: `${WEATHER_TODAY}T17:20:00.000Z` },
};

export const fallbackWeatherSettingsFixture: WeatherSettings = {
  ...weatherSettingsFixture,
  last: { provider: "open-meteo", fallbackFrom: "kmi", fetchedAt: `${WEATHER_TODAY}T17:20:00.000Z` },
};
