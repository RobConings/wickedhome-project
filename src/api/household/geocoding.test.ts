/**
 * Unit tests for the geocoder response parsing and the settings schema. No network.
 * Run: npx tsx --test src/api/household/geocoding.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHomeAddress, householdSettingsInputSchema, mapUrl } from "@/features/household/types/household-settings";
import { isWalloonPostalCode, parseGeopuntResult, parseNominatimResult } from "./geocoding";

describe("Geopunt", () => {
  const body = {
    LocationResult: [
      {
        Municipality: "Hasselt",
        Zipcode: "3500",
        Thoroughfarename: "Grote Markt",
        Housenumber: "1",
        Location: { Lat_WGS84: 50.929464901284717, Lon_WGS84: 5.3370296981023237 },
      },
    ],
  };
  it("takes the first result in the same postal code", () => {
    assert.deepEqual(parseGeopuntResult(body, "3500"), { latitude: 50.929464901284717, longitude: 5.3370296981023237, source: "geopunt" });
  });
  it("ignores results in another postal code or outside Belgium", () => {
    assert.equal(parseGeopuntResult(body, "3600"), null);
    assert.equal(parseGeopuntResult({ LocationResult: [] }, "3500"), null);
    assert.equal(parseGeopuntResult({ LocationResult: [{ Zipcode: "3500", Location: { Lat_WGS84: 0, Lon_WGS84: 0 } }] }, "3500"), null);
  });
});

describe("Nominatim", () => {
  it("parses the first Belgian result", () => {
    assert.deepEqual(parseNominatimResult([{ lat: "50.5978552", lon: "4.3248275" }]), {
      latitude: 50.5978552,
      longitude: 4.3248275,
      source: "nominatim",
    });
    assert.equal(parseNominatimResult([]), null);
    assert.equal(parseNominatimResult([{ lat: "48.85", lon: "2.35" }]), null);
  });
  it("knows which postal codes are Walloon", () => {
    assert.equal(isWalloonPostalCode("1400"), true);
    assert.equal(isWalloonPostalCode("4000"), true);
    assert.equal(isWalloonPostalCode("3500"), false);
    assert.equal(isWalloonPostalCode("1000"), false);
  });
});

describe("household settings input", () => {
  const base = { name: "Coppens" };
  it("accepts no address at all", () => {
    assert.equal(householdSettingsInputSchema.safeParse(base).success, true);
  });
  it("wants the whole address once one part is filled", () => {
    const result = householdSettingsInputSchema.safeParse({ ...base, street: "Grote Markt" });
    assert.equal(result.success, false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")).sort();
    assert.deepEqual(paths, ["municipality", "number", "postalCode"]);
  });
  it("parses manual coordinates with a decimal comma and checks they lie in Belgium", () => {
    const ok = householdSettingsInputSchema.parse({ ...base, locationMode: "manual", latitude: "50,9295", longitude: "5,337" });
    assert.equal(ok.latitude, 50.9295);
    assert.equal(ok.longitude, 5.337);
    assert.equal(householdSettingsInputSchema.safeParse({ ...base, locationMode: "manual", latitude: "5,337", longitude: "50,9" }).success, false);
    assert.equal(householdSettingsInputSchema.safeParse({ ...base, locationMode: "manual" }).success, false);
  });
  it("formats the address and a map link", () => {
    const address = { street: "Grote Markt", number: "1", box: "2", postalCode: "3500", municipality: "Hasselt", country: "BE" };
    assert.equal(formatHomeAddress(address), "Grote Markt 1 bus 2, 3500 Hasselt");
    assert.equal(mapUrl({ latitude: 50.9, longitude: 5.3 }), "https://www.openstreetmap.org/?mlat=50.900000&mlon=5.300000#map=18/50.900000/5.300000");
  });
});
