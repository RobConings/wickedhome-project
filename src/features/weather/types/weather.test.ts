/**
 * Unit tests for weather codes and the rain outlook. Run: npx tsx --test src/features/weather/types/weather.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rainOutlook, weatherCondition, windCompass, type WeatherHour } from "./weather";

const hour = (time: string, precipitation: number, precipitationProbability: number | null = 0): WeatherHour => ({
  time,
  temperature: 12,
  precipitation,
  precipitationProbability,
  condition: "overcast",
  isDay: true,
});

describe("weatherCondition", () => {
  it("maps WMO codes", () => {
    assert.equal(weatherCondition(0), "clear");
    assert.equal(weatherCondition(2), "partly_cloudy");
    assert.equal(weatherCondition(45), "fog");
    assert.equal(weatherCondition(53), "drizzle");
    assert.equal(weatherCondition(65), "heavy_rain");
    assert.equal(weatherCondition(81), "rain_showers");
    assert.equal(weatherCondition(75), "snow");
    assert.equal(weatherCondition(95), "thunderstorm");
    assert.equal(weatherCondition(99), "thunderstorm_hail");
    assert.equal(weatherCondition(42), "unknown");
  });
});

describe("rainOutlook", () => {
  it("is dry when no hour is wet", () => {
    assert.deepEqual(rainOutlook([hour("2026-10-02T10:00", 0, 10), hour("2026-10-02T11:00", 0.1, 20)]), { kind: "dry" });
  });
  it("finds the first wet hour by amount or chance", () => {
    assert.deepEqual(rainOutlook([hour("2026-10-02T10:00", 0), hour("2026-10-02T11:00", 0, 60), hour("2026-10-02T12:00", 1.5)]), {
      kind: "later",
      from: "2026-10-02T11:00",
      total: 1.5,
    });
  });
  it("says until when it rains now", () => {
    assert.deepEqual(rainOutlook([hour("2026-10-02T10:00", 0.8), hour("2026-10-02T11:00", 0.4), hour("2026-10-02T12:00", 0)]), {
      kind: "now",
      until: "2026-10-02T12:00",
      total: 1.2,
    });
    assert.equal(rainOutlook([hour("2026-10-02T10:00", 0.8)]).kind, "now");
  });
});

describe("windCompass", () => {
  it("rounds to eight points", () => {
    assert.equal(windCompass(0), "N");
    assert.equal(windCompass(350), "N");
    assert.equal(windCompass(44), "NE");
    assert.equal(windCompass(235), "SW");
    assert.equal(windCompass(-90), "W");
  });
});
