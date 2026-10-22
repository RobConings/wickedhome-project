/**
 * Unit tests for the sun's position (NOAA formulas), checked against what the geometry says for Brussels
 * on the solstices and the equinox. Run on the server:
 *
 *   npx tsx --test src/lib/sun-position.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { solarNoon, sunPosition } from "./sun-position";

const BRUSSELS = { latitude: 50.8503, longitude: 4.3517 };
const near = (actual: number, expected: number, tolerance: number, what = "value") =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual.toFixed(3)} is not within ${tolerance} of ${expected}`);

const at = (iso: string) => sunPosition(new Date(iso), BRUSSELS.latitude, BRUSSELS.longitude);

/** The first minute of the UTC day at which the sun is above the horizon. */
function sunrise(day: string) {
  for (let minute = 0; minute < 1440; minute++) {
    const date = new Date(Date.parse(`${day}T00:00:00Z`) + minute * 60_000);
    const position = sunPosition(date, BRUSSELS.latitude, BRUSSELS.longitude);
    if (position.elevation > 0) return position;
  }
  throw new Error("No sunrise");
}

describe("sun position in Brussels", () => {
  it("finds solar noon about 13:44 summer time on the June solstice and 12:41 winter time in December", () => {
    const june = solarNoon(new Date("2024-06-21T12:00:00Z"), BRUSSELS.longitude);
    near(june.getUTCHours() * 60 + june.getUTCMinutes(), 11 * 60 + 44, 2, "June solar noon (UTC minutes)");
    const december = solarNoon(new Date("2024-12-21T12:00:00Z"), BRUSSELS.longitude);
    near(december.getUTCHours() * 60 + december.getUTCMinutes(), 11 * 60 + 41, 2, "December solar noon (UTC minutes)");
  });

  it("stands due south at 62,6° on the June solstice at solar noon (90 − 50,85 + 23,44)", () => {
    const noon = solarNoon(new Date("2024-06-21T12:00:00Z"), BRUSSELS.longitude);
    const sun = sunPosition(noon, BRUSSELS.latitude, BRUSSELS.longitude);
    near(sun.declination, 23.44, 0.05, "declination");
    near(sun.elevation, 62.59, 0.3, "elevation");
    near(sun.azimuth, 180, 0.5, "azimuth");
  });

  it("stands due south at 15,7° on the December solstice at solar noon (90 − 50,85 − 23,44)", () => {
    const noon = solarNoon(new Date("2024-12-21T12:00:00Z"), BRUSSELS.longitude);
    const sun = sunPosition(noon, BRUSSELS.latitude, BRUSSELS.longitude);
    near(sun.declination, -23.44, 0.05, "declination");
    near(sun.elevation, 15.71, 0.3, "elevation");
    near(sun.azimuth, 180, 0.5, "azimuth");
  });

  it("stands at about 39,2° on the March equinox at solar noon (90 − 50,85)", () => {
    const noon = solarNoon(new Date("2024-03-20T12:00:00Z"), BRUSSELS.longitude);
    const sun = sunPosition(noon, BRUSSELS.latitude, BRUSSELS.longitude);
    near(sun.declination, 0, 0.4, "declination");
    near(sun.elevation, 39.15, 0.5, "elevation");
    near(sun.azimuth, 180, 0.5, "azimuth");
  });

  it("rises in the east at the equinox and in the north-east (about 51°) at the June solstice", () => {
    near(sunrise("2024-03-20").azimuth, 90, 2, "equinox sunrise azimuth");
    near(sunrise("2024-06-21").azimuth, 50.9, 2, "June sunrise azimuth");
    near(sunrise("2024-12-21").azimuth, 129.1, 2, "December sunrise azimuth");
  });

  it("is east of south in the morning, west of south in the afternoon and below the horizon at night", () => {
    assert.ok(at("2024-06-21T07:00:00Z").azimuth < 180);
    assert.ok(at("2024-06-21T16:00:00Z").azimuth > 180);
    assert.ok(at("2024-06-21T23:30:00Z").elevation < 0);
    assert.ok(at("2024-12-21T03:00:00Z").elevation < -30);
  });

  it("gives the same answer for the same moment written in another time zone", () => {
    const utc = at("2024-06-21T10:00:00Z");
    const brussels = at("2024-06-21T12:00:00+02:00");
    near(brussels.azimuth, utc.azimuth, 1e-9);
    near(brussels.elevation, utc.elevation, 1e-9);
  });
});
