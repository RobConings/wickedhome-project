/**
 * Unit tests for provider choice and fallback, with stubbed providers. No network, no database.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { OutboundError } from "../lib/fixed-host-fetch";
import { WEATHER_PROVIDERS, type ProviderForecast, type WeatherProvider } from "./providers";
import { clearWeatherCache, forecastFor } from "./weather.service";

const sample = (temperature: number): ProviderForecast => ({
  latitude: 50.93,
  longitude: 5.34,
  fetchedAt: "2026-10-02T19:00:00.000Z",
  current: {
    time: "2026-10-02T21:00",
    temperature,
    apparentTemperature: null,
    humidity: null,
    precipitation: 0,
    condition: "clear",
    isDay: false,
    windSpeed: 5,
    windGusts: null,
    windDirection: 90,
  },
  hours: [],
  days: [],
});

const originals = { ...WEATHER_PROVIDERS };
function stub(id: keyof typeof WEATHER_PROVIDERS, fetchForecast: WeatherProvider["fetchForecast"]) {
  WEATHER_PROVIDERS[id] = { ...originals[id], fetchForecast, isConfigured: () => true };
}

afterEach(() => {
  Object.assign(WEATHER_PROVIDERS, originals);
  clearWeatherCache();
});

describe("weather provider fallback", () => {
  it("uses the chosen provider when it works, and caches it", async () => {
    let calls = 0;
    stub("kmi", async () => {
      calls += 1;
      return sample(15);
    });
    const first = await forecastFor("kmi", 50.93, 5.34);
    const second = await forecastFor("kmi", 50.93, 5.34);
    assert.equal(first.status === "ok" && first.forecast.provider, "kmi");
    assert.equal(first.status === "ok" && first.forecast.fallbackFrom, null);
    assert.equal(second.status === "ok" && second.forecast.current.temperature, 15);
    assert.equal(calls, 1);
  });

  it("falls back to Open-Meteo when the chosen provider fails", async () => {
    stub("kmi", async () => {
      throw new OutboundError("app.meteo.be answered 503", 503);
    });
    stub("open-meteo", async () => sample(17));
    const response = await forecastFor("kmi", 50.93, 5.34);
    assert.equal(response.status, "ok");
    if (response.status !== "ok") return;
    assert.equal(response.forecast.provider, "open-meteo");
    assert.equal(response.forecast.fallbackFrom, "kmi");
    assert.equal(response.forecast.current.temperature, 17);
  });

  it("falls back when the chosen provider isn't configured", async () => {
    stub("open-meteo", async () => sample(17));
    WEATHER_PROVIDERS.google = { ...originals.google, isConfigured: () => false };
    const response = await forecastFor("google", 50.93, 5.34);
    assert.equal(response.status === "ok" && response.forecast.fallbackFrom, "google");
  });

  it("is unavailable when everything fails and nothing is cached", async () => {
    stub("kmi", async () => {
      throw new OutboundError("down");
    });
    stub("open-meteo", async () => {
      throw new OutboundError("down");
    });
    assert.deepEqual(await forecastFor("kmi", 50.93, 5.34), { status: "unavailable" });
  });
});
