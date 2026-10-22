/**
 * Unit tests for the weather adapters: Open-Meteo and KMI with trimmed real responses (2 October 2026),
 * Google with the documented response shape. No network.
 * Run: npm test (or DATABASE_URL=postgresql://x@localhost/x npx tsx --test src/api/weather/providers/providers.test.ts)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutboundError } from "../../lib/fixed-host-fetch";
import { googleCondition, parseGoogle } from "./google";
import { kmiCondition, kmiDayDate, kmiKey, parseKmi, type KmiResponse } from "./kmi";
import { forecastUrl, parseOpenMeteo, type OpenMeteoResponse } from "./open-meteo";
import { localDateTime } from "./provider";

const hoursOf = (day: string, from: number, count: number) =>
  Array.from({ length: count }, (_, index) => `${day}T${String(from + index).padStart(2, "0")}:00`);

describe("Open-Meteo", () => {
  const body: OpenMeteoResponse = {
    latitude: 50.926,
    longitude: 5.336,
    current: {
      time: "2026-10-02T21:15",
      temperature_2m: 17.43,
      relative_humidity_2m: 57,
      apparent_temperature: 16.1,
      is_day: 0,
      precipitation: 0,
      weather_code: 3,
      wind_speed_10m: 6.4,
      wind_direction_10m: 77,
      wind_gusts_10m: 9,
    },
    hourly: {
      time: hoursOf("2026-10-02", 0, 24),
      temperature_2m: Array.from({ length: 24 }, (_, index) => 10 + index / 2),
      precipitation_probability: Array.from({ length: 24 }, (_, index) => (index === 22 ? 60 : null)),
      precipitation: Array.from({ length: 24 }, (_, index) => (index === 22 ? 0.8 : 0)),
      weather_code: Array.from({ length: 24 }, (_, index) => (index === 22 ? 61 : 2)),
      is_day: Array.from({ length: 24 }, (_, index) => (index >= 8 && index < 19 ? 1 : 0)),
    },
    daily: {
      time: ["2026-10-02", "2026-10-03"],
      weather_code: [3, 80],
      temperature_2m_max: [20.4, 22.5],
      temperature_2m_min: [11.3, 11.5],
      precipitation_sum: [0, 3.24],
      precipitation_probability_max: [0, 55],
      wind_speed_10m_max: [9.2, 17.8],
      sunrise: ["2026-10-02T07:40", "2026-10-03T07:42"],
      sunset: ["2026-10-02T19:14", "2026-10-03T19:12"],
    },
  };

  it("rounds the coordinates it sends to about a kilometre", () => {
    const url = new URL(forecastUrl(50.929464, 5.337029));
    assert.equal(url.hostname, "api.open-meteo.com");
    assert.equal(url.searchParams.get("latitude"), "50.93");
    assert.equal(url.searchParams.get("longitude"), "5.34");
    assert.equal(url.searchParams.get("timezone"), "Europe/Brussels");
  });

  it("parses current conditions, the hours from now and the days", () => {
    const forecast = parseOpenMeteo(body, new Date("2026-10-02T19:15:00Z"));
    assert.equal(forecast.current.temperature, 17.4);
    assert.equal(forecast.current.condition, "overcast");
    assert.equal(forecast.current.isDay, false);
    assert.equal(forecast.current.windSpeed, 6);
    assert.deepEqual(
      forecast.hours.map((hour) => hour.time),
      ["2026-10-02T21:00", "2026-10-02T22:00", "2026-10-02T23:00"],
    );
    assert.equal(forecast.hours[1]?.condition, "rain");
    assert.equal(forecast.hours[1]?.precipitationProbability, 60);
    assert.equal(forecast.hours[0]?.precipitationProbability, null);
    assert.deepEqual(forecast.days[1], {
      date: "2026-10-03",
      condition: "rain_showers",
      temperatureMax: 22.5,
      temperatureMin: 11.5,
      precipitationSum: 3.2,
      precipitationProbability: 55,
      windSpeedMax: 18,
      sunrise: "2026-10-03T07:42",
      sunset: "2026-10-03T19:12",
    });
  });

  it("rejects an incomplete response", () => {
    assert.throws(() => parseOpenMeteo({ current: { time: "2026-10-02T21:15" } }, new Date()), OutboundError);
  });
});

describe("KMI", () => {
  const body: KmiResponse = {
    obs: { temp: 15, timestamp: "2026-10-02T21:30:00+02:00", ww: 14, dayNight: "n" },
    for: {
      hourly: [
        { hour: "22", temp: 12, ww: "1", precipChance: "0", precipQuantity: 0, windSpeedKm: 5, windPeakSpeedKm: null, windDirection: 248, dayNight: "n" },
        { hour: "23", temp: 12, ww: "18", precipChance: "70", precipQuantity: 0.6, windSpeedKm: 6, windPeakSpeedKm: 20, windDirection: 270, dayNight: "n" },
        { hour: "00", temp: 11, ww: "3", precipChance: "10", precipQuantity: "0", windSpeedKm: 5, windPeakSpeedKm: null, windDirection: 270, dayNight: "n", dateShow: "Sa 03/10" },
        { hour: "01", temp: 11, ww: "3", precipChance: "10", precipQuantity: 0, windSpeedKm: 5, windPeakSpeedKm: null, windDirection: 270, dayNight: "n" },
      ],
      daily: [
        { dayName: { en: "Tonight" }, dayNight: "n", tempMin: 10, tempMax: null, ww1: 3, precipChance: 0, precipQuantity: "0", wind: { speed: 1 }, dawnRiseSeconds: "27840", dawnSetSeconds: "69540" },
        { dayName: { en: "Saturday" }, dayNight: "d", tempMin: 8, tempMax: 21, ww1: 1, precipChance: 10, precipQuantity: "0.2", wind: { speed: 10 }, dawnRiseSeconds: "27960", dawnSetSeconds: "69420" },
        { dayName: { en: "Sunday" }, dayNight: "d", tempMin: 9, tempMax: 18, ww1: 16, precipChance: 60, precipQuantity: "3", wind: { speed: 20 } },
      ],
    },
  };
  const now = new Date("2026-10-02T19:40:00Z");

  it("computes the app's daily key from the Brussels date", () => {
    assert.match(kmiKey(now), /^[0-9a-f]{32}$/);
    // 23:30 UTC on 2 October is already 3 October in Brussels.
    assert.equal(kmiKey(new Date("2026-10-02T23:30:00Z")), kmiKey(new Date("2026-10-03T08:00:00Z")));
    assert.notEqual(kmiKey(now), kmiKey(new Date("2026-10-03T08:00:00Z")));
  });

  it("maps KMI pictogram codes", () => {
    assert.equal(kmiCondition(0), "clear");
    assert.equal(kmiCondition(3), "partly_cloudy");
    assert.equal(kmiCondition(15), "overcast");
    assert.equal(kmiCondition(18), "rain");
    assert.equal(kmiCondition(16), "rain_showers");
    assert.equal(kmiCondition(2), "thunderstorm");
    assert.equal(kmiCondition(20), "sleet");
    assert.equal(kmiCondition(22), "snow");
    assert.equal(kmiCondition(25), "fog");
    assert.equal(kmiCondition(99), "unknown");
    assert.equal(kmiCondition(null), "unknown");
  });

  it("dates daily entries by name", () => {
    assert.equal(kmiDayDate("Tonight", "2026-10-02", null), "2026-10-02");
    assert.equal(kmiDayDate("Saturday", "2026-10-02", "2026-10-02"), "2026-10-03");
    assert.equal(kmiDayDate("Friday", "2026-10-02", null), "2026-10-02");
    assert.equal(kmiDayDate("Tomorrow", "2026-10-02", null), "2026-10-03");
    assert.equal(kmiDayDate(undefined, "2026-10-02", "2026-10-04"), "2026-10-05");
  });

  it("parses now, the hours across midnight and the days", () => {
    const forecast = parseKmi(body, 50.93, 5.34, now);
    assert.deepEqual(forecast.current, {
      time: "2026-10-02T21:30",
      temperature: 15,
      apparentTemperature: null,
      humidity: null,
      precipitation: 0,
      condition: "overcast",
      isDay: false,
      windSpeed: 5,
      windGusts: null,
      // Blowing towards 248° = coming from 68° (ENE).
      windDirection: 68,
    });
    assert.deepEqual(
      forecast.hours.map((hour) => [hour.time, hour.condition, hour.precipitationProbability]),
      [
        ["2026-10-02T22:00", "mostly_clear", 0],
        ["2026-10-02T23:00", "rain", 70],
        ["2026-10-03T00:00", "partly_cloudy", 10],
        ["2026-10-03T01:00", "partly_cloudy", 10],
      ],
    );
    assert.deepEqual(
      forecast.days.map((day) => [day.date, day.condition, day.temperatureMin, day.temperatureMax]),
      [
        // Tonight has no maximum: the hourly temperatures of today fill it in.
        ["2026-10-02", "partly_cloudy", 10, 12],
        ["2026-10-03", "mostly_clear", 8, 21],
        ["2026-10-04", "rain_showers", 9, 18],
      ],
    );
    assert.equal(forecast.days[1]?.sunrise, "2026-10-03T07:46");
    assert.equal(forecast.days[1]?.precipitationSum, 0.2);
  });

  it("rejects an incomplete response", () => {
    assert.throws(() => parseKmi({ obs: { temp: 3 } }, 50.9, 5.3, now), OutboundError);
  });
});

describe("Google", () => {
  const current = {
    currentTime: "2026-10-02T19:30:00.123Z",
    isDaytime: false,
    weatherCondition: { type: "MOSTLY_CLOUDY" },
    temperature: { degrees: 16.4, unit: "CELSIUS" },
    feelsLikeTemperature: { degrees: 15.9 },
    relativeHumidity: 61,
    precipitation: { probability: { percent: 10 }, qpf: { quantity: 0 } },
    wind: { direction: { degrees: 235 }, speed: { value: 11 }, gust: { value: 24.4 } },
  };
  const hourly = {
    forecastHours: [
      {
        displayDateTime: { year: 2026, month: 10, day: 2, hours: 21 },
        isDaytime: false,
        weatherCondition: { type: "LIGHT_RAIN_SHOWERS" },
        temperature: { degrees: 15.2 },
        precipitation: { probability: { percent: 55 }, qpf: { quantity: 0.4 } },
      },
      {
        interval: { startTime: "2026-10-02T20:00:00Z" },
        isDaytime: false,
        weatherCondition: { type: "RAIN_AND_SNOW" },
        temperature: { degrees: 14.8 },
      },
    ],
  };
  const daily = {
    forecastDays: [
      {
        displayDate: { year: 2026, month: 10, day: 3 },
        daytimeForecast: { weatherCondition: { type: "PARTLY_CLOUDY" }, precipitation: { probability: { percent: 20 }, qpf: { quantity: 0.5 } }, wind: { speed: { value: 14 } } },
        nighttimeForecast: { weatherCondition: { type: "CLEAR" }, precipitation: { probability: { percent: 5 }, qpf: { quantity: 0 } }, wind: { speed: { value: 9 } } },
        maxTemperature: { degrees: 21.3 },
        minTemperature: { degrees: 9.6 },
        sunEvents: { sunriseTime: "2026-10-03T05:42:10.5Z", sunsetTime: "2026-10-03T17:12:00Z" },
      },
    ],
  };

  it("maps Google condition types", () => {
    assert.equal(googleCondition("CLEAR"), "clear");
    assert.equal(googleCondition("MOSTLY_CLOUDY"), "overcast");
    assert.equal(googleCondition("HEAVY_RAIN"), "heavy_rain");
    assert.equal(googleCondition("SCATTERED_SHOWERS"), "rain_showers");
    assert.equal(googleCondition("RAIN_AND_SNOW"), "sleet");
    assert.equal(googleCondition("SNOW_SHOWERS"), "snow_showers");
    assert.equal(googleCondition("HEAVY_SNOW_STORM"), "snow");
    assert.equal(googleCondition("HAIL"), "freezing_rain");
    assert.equal(googleCondition("SCATTERED_THUNDERSTORMS"), "thunderstorm");
    assert.equal(googleCondition("TYPE_UNSPECIFIED"), "unknown");
  });

  it("parses current conditions, hours and days into local times", () => {
    const forecast = parseGoogle(current, hourly, daily, 50.93, 5.34, new Date("2026-10-02T19:31:00Z"));
    assert.deepEqual(forecast.current, {
      time: "2026-10-02T21:30",
      temperature: 16.4,
      apparentTemperature: 15.9,
      humidity: 61,
      precipitation: 0,
      condition: "overcast",
      isDay: false,
      windSpeed: 11,
      windGusts: 24,
      windDirection: 235,
    });
    assert.deepEqual(
      forecast.hours.map((hour) => [hour.time, hour.condition, hour.precipitationProbability, hour.precipitation]),
      [
        ["2026-10-02T21:00", "rain_showers", 55, 0.4],
        ["2026-10-02T22:00", "sleet", null, 0],
      ],
    );
    assert.deepEqual(forecast.days[0], {
      date: "2026-10-03",
      condition: "partly_cloudy",
      temperatureMax: 21.3,
      temperatureMin: 9.6,
      precipitationSum: 0.5,
      precipitationProbability: 20,
      windSpeedMax: 14,
      sunrise: "2026-10-03T07:42",
      sunset: "2026-10-03T19:12",
    });
  });

  it("rejects an incomplete response", () => {
    assert.throws(() => parseGoogle({}, {}, {}, 50.9, 5.3, new Date()), OutboundError);
  });
});

describe("localDateTime", () => {
  it("shows instants in Brussels time, across DST", () => {
    assert.equal(localDateTime("2026-10-02T19:30:00Z"), "2026-10-02T21:30");
    assert.equal(localDateTime("2026-12-02T19:30:00Z"), "2026-12-02T20:30");
    assert.equal(localDateTime("nonsense"), null);
  });
});
