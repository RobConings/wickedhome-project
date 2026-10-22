import { createHash } from "node:crypto";
import { WEATHER_ATTRIBUTIONS, type WeatherCondition, type WeatherDay, type WeatherHour } from "@/features/weather/types/weather";
import { HOUSEHOLD_TIME_ZONE, addDays, todayIn } from "@/types/dates";
import { OutboundError, fetchJsonFromFixedHost } from "../../lib/fixed-host-fetch";
import { FORECAST_DAYS, FORECAST_HOURS, numberOrNull, round1, type ProviderForecast, type WeatherProvider } from "./provider";

/*
 * KMI/IRM (Royal Meteorological Institute of Belgium) through the API of its mobile app, the same one the
 * Home Assistant `irm_kmi` integration uses. UNOFFICIAL: undocumented and may change without notice.
 * KMI's open data (opendata.meteo.be) offers observations and model grids, not a ready point forecast.
 *
 *   GET https://app.meteo.be/services/appv4/?s=getForecasts&k=<key>&lat=<lat>&long=<lon>
 *   key = md5("r9EnW374jkJ9acc;getForecasts;<dd/mm/yyyy>") with today's date in Brussels.
 *
 * Response: `obs` (now: temp, ww, dayNight), `for.hourly` ({ hour, temp, ww, precipChance, precipQuantity,
 * windSpeedKm, windPeakSpeedKm, windDirection, dayNight, dateShow? }), `for.daily` ({ dayName.en, dayNight,
 * tempMin, tempMax, ww1, precipChance, precipQuantity, wind.speed, dawnRiseSeconds, dawnSetSeconds }).
 * `ww` is KMI's own pictogram code (0–27). Hourly entries carry only the hour; a `dateShow` marks a new day.
 * `windDirection` points where the wind blows to; we store where it comes from (+180°).
 */

const HOST = "app.meteo.be";

/** The daily API key the app computes. */
export function kmiKey(date: Date = new Date()): string {
  const [year, month, day] = todayIn(HOUSEHOLD_TIME_ZONE, date).split("-");
  return createHash("md5").update(`r9EnW374jkJ9acc;getForecasts;${day}/${month}/${year}`).digest("hex");
}

/**
 * KMI pictogram codes → our conditions (grouping after the irm_kmi integration's mapping): sunny 0–1,
 * partly cloudy 3, cloudy 14–15, fog 24–27, rain 18/21, showers 4/6/16/19, thunder 2/5/7/10/13/17,
 * sleet 8/9/20, snow 11/12/22/23.
 */
export function kmiCondition(ww: number | null): WeatherCondition {
  switch (ww) {
    case 0:
      return "clear";
    case 1:
      return "mostly_clear";
    case 3:
      return "partly_cloudy";
    case 14:
    case 15:
      return "overcast";
    case 24:
    case 25:
    case 26:
    case 27:
      return "fog";
    case 18:
    case 21:
      return "rain";
    case 4:
    case 6:
    case 16:
    case 19:
      return "rain_showers";
    case 2:
    case 5:
    case 7:
    case 10:
    case 13:
    case 17:
      return "thunderstorm";
    case 8:
    case 9:
    case 20:
      return "sleet";
    case 11:
    case 12:
    case 22:
    case 23:
      return "snow";
    default:
      return "unknown";
  }
}

type KmiHour = {
  hour?: string;
  temp?: number | string;
  ww?: number | string;
  precipChance?: number | string;
  precipQuantity?: number | string;
  windSpeedKm?: number | string | null;
  windPeakSpeedKm?: number | string | null;
  windDirection?: number | string;
  dayNight?: string;
  dateShow?: unknown;
};
type KmiDay = {
  dayName?: { en?: string };
  dayNight?: string;
  tempMin?: number | string | null;
  tempMax?: number | string | null;
  ww1?: number | string | null;
  precipChance?: number | string | null;
  precipQuantity?: number | string | null;
  wind?: { speed?: number | string | null };
  dawnRiseSeconds?: number | string | null;
  dawnSetSeconds?: number | string | null;
};
export type KmiResponse = {
  obs?: { temp?: number | string; timestamp?: string; ww?: number | string; dayNight?: string };
  for?: { hourly?: KmiHour[]; daily?: KmiDay[] };
};

const pad = (value: number) => String(value).padStart(2, "0");
const clockFromSeconds = (date: string, seconds: number | null) =>
  seconds === null ? null : `${date}T${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor((seconds % 3600) / 60))}`;
const fromDirection = (towards: number | null) => (towards === null ? 0 : Math.round((towards + 180) % 360));

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The date of a daily entry from its English name: "Today"/"Tonight" (today), "Tomorrow", or a weekday
 * (the first such day from the day after the previous entry, or from today for the first entry).
 */
export function kmiDayDate(name: string | undefined, today: string, previous: string | null): string {
  if (name === "Today" || name === "Tonight") return today;
  if (name === "Tomorrow") return addDays(today, 1);
  const start = previous ? addDays(previous, 1) : today;
  const weekday = name ? WEEKDAYS.indexOf(name) : -1;
  if (weekday === -1) return start;
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = addDays(start, offset);
    if (new Date(`${candidate}T12:00:00Z`).getUTCDay() === weekday) return candidate;
  }
  return start;
}

/** Turns a KMI app response into our contract. `now` decides which day the first hourly entry is on. */
export function parseKmi(body: KmiResponse, latitude: number, longitude: number, now: Date): ProviderForecast {
  const hourly = body.for?.hourly ?? [];
  const daily = body.for?.daily ?? [];
  const obs = body.obs;
  if (!obs || hourly.length === 0 || daily.length === 0) throw new OutboundError("KMI sent an incomplete forecast");
  const today = todayIn(HOUSEHOLD_TIME_ZONE, now);

  // Hourly: dates from the running hour; a `dateShow` (or the hour wrapping around) starts the next day.
  let day = today;
  let previousHour = -1;
  const allHours: WeatherHour[] = [];
  hourly.forEach((entry, index) => {
    const hour = numberOrNull(entry.hour);
    if (hour === null) return;
    if (index > 0 && (entry.dateShow !== undefined || hour < previousHour)) day = addDays(day, 1);
    previousHour = hour;
    allHours.push({
      time: `${day}T${pad(hour)}:00`,
      temperature: round1(numberOrNull(entry.temp) ?? 0),
      precipitation: round1(numberOrNull(entry.precipQuantity) ?? 0),
      precipitationProbability: numberOrNull(entry.precipChance),
      condition: kmiCondition(numberOrNull(entry.ww)),
      isDay: entry.dayNight !== "n",
    });
  });
  const first = hourly[0];

  // Daily: day and night parts of one date are merged (the day part decides the condition).
  const byDate = new Map<string, KmiDay[]>();
  let previous: string | null = null;
  for (const entry of daily) {
    const date = kmiDayDate(entry.dayName?.en, today, previous);
    previous = date;
    byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  }
  const days: WeatherDay[] = [...byDate.entries()].slice(0, FORECAST_DAYS).map(([date, parts]) => {
    const values = (pick: (part: KmiDay) => unknown) => parts.map(pick).map(numberOrNull).filter((value): value is number => value !== null);
    const dayPart = parts.find((part) => part.dayNight === "d") ?? parts[0];
    const hourTemps = allHours.filter((hour) => hour.time.startsWith(date)).map((hour) => hour.temperature);
    const maxima = values((part) => part.tempMax);
    const minima = values((part) => part.tempMin);
    const winds = values((part) => part.wind?.speed);
    const chances = values((part) => part.precipChance);
    return {
      date,
      condition: kmiCondition(numberOrNull(dayPart?.ww1)),
      temperatureMax: round1(maxima.length ? Math.max(...maxima) : hourTemps.length ? Math.max(...hourTemps) : (numberOrNull(obs.temp) ?? 0)),
      temperatureMin: round1(minima.length ? Math.min(...minima) : hourTemps.length ? Math.min(...hourTemps) : (numberOrNull(obs.temp) ?? 0)),
      precipitationSum: round1(values((part) => part.precipQuantity).reduce((sum, value) => sum + value, 0)),
      precipitationProbability: chances.length ? Math.max(...chances) : null,
      windSpeedMax: winds.length ? Math.round(Math.max(...winds)) : null,
      sunrise: clockFromSeconds(date, numberOrNull(dayPart?.dawnRiseSeconds)),
      sunset: clockFromSeconds(date, numberOrNull(dayPart?.dawnSetSeconds)),
    };
  });

  return {
    latitude,
    longitude,
    fetchedAt: now.toISOString(),
    current: {
      time: obs.timestamp?.slice(0, 16) ?? allHours[0]?.time ?? `${today}T00:00`,
      temperature: round1(numberOrNull(obs.temp) ?? allHours[0]?.temperature ?? 0),
      apparentTemperature: null,
      humidity: null,
      precipitation: round1(numberOrNull(first?.precipQuantity) ?? 0),
      condition: kmiCondition(numberOrNull(obs.ww) ?? numberOrNull(first?.ww)),
      isDay: (obs.dayNight ?? first?.dayNight) !== "n",
      windSpeed: Math.round(numberOrNull(first?.windSpeedKm) ?? 0),
      windGusts: numberOrNull(first?.windPeakSpeedKm),
      windDirection: fromDirection(numberOrNull(first?.windDirection)),
    },
    hours: allHours.slice(0, FORECAST_HOURS),
    days,
  };
}

export const kmiProvider: WeatherProvider = {
  info: { id: "kmi", name: "KMI/IRM", website: "https://www.meteo.be/", attribution: WEATHER_ATTRIBUTIONS.kmi, unofficial: true },
  isConfigured: () => true,
  async fetchForecast(latitude, longitude) {
    const lat = Number(latitude.toFixed(2));
    const lon = Number(longitude.toFixed(2));
    const url = new URL(`https://${HOST}/services/appv4/`);
    url.searchParams.set("s", "getForecasts");
    url.searchParams.set("k", kmiKey());
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("long", String(lon));
    const body = await fetchJsonFromFixedHost<KmiResponse>(url.toString(), {
      allowedHosts: [HOST],
      timeoutMs: 8_000,
      maxBytes: 1_500_000,
    });
    return parseKmi(body, lat, lon, new Date());
  },
};
