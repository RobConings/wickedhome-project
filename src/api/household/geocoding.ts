import type { HomeAddress, LocationSource } from "@/features/household/types/household-settings";
import { BELGIUM_BOUNDS } from "@/features/household/types/household-settings";
import { OutboundError, fetchJsonFromFixedHost } from "../lib/fixed-host-fetch";

/*
 * Geocoding of the home address (address → WGS84 coordinates), server-side, on save.
 *
 * 1. Geopunt geolocation service of the Flemish government (Digitaal Vlaanderen), backed by the address
 *    register (Basisregisters Vlaanderen). Free, no key, house-number precision, WGS84 in the response.
 *    Covers Flanders (and the Brussels addresses in the register); returns nothing for Wallonia.
 * 2. OpenStreetMap Nominatim as fallback for the rest of Belgium: structured query, our own User-Agent,
 *    at most one request per second (usage policy), results © OpenStreetMap contributors (ODbL).
 *
 * Both fail soft: the caller saves the address without coordinates and the user can enter them by hand.
 */

export type GeocodeResult = { latitude: number; longitude: number; source: Exclude<LocationSource, "manual"> };

const GEOPUNT_HOST = "geo.api.vlaanderen.be";
const NOMINATIM_HOST = "nominatim.openstreetmap.org";

const inBelgium = (latitude: number, longitude: number) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= BELGIUM_BOUNDS.minLatitude &&
  latitude <= BELGIUM_BOUNDS.maxLatitude &&
  longitude >= BELGIUM_BOUNDS.minLongitude &&
  longitude <= BELGIUM_BOUNDS.maxLongitude;

/** Walloon postal codes: Geopunt has no addresses there, so we go straight to Nominatim. */
export const isWalloonPostalCode = (postalCode: string) => {
  const code = Number(postalCode);
  return (code >= 1300 && code <= 1499) || (code >= 4000 && code <= 7999);
};

type GeopuntResponse = {
  LocationResult?: {
    Zipcode?: string | null;
    Housenumber?: string | null;
    Location?: { Lat_WGS84?: number; Lon_WGS84?: number };
  }[];
};

/** The first Geopunt result in the same postal code, or `null`. */
export function parseGeopuntResult(body: GeopuntResponse, postalCode: string): GeocodeResult | null {
  for (const result of body.LocationResult ?? []) {
    const latitude = Number(result.Location?.Lat_WGS84);
    const longitude = Number(result.Location?.Lon_WGS84);
    if (result.Zipcode === postalCode && inBelgium(latitude, longitude)) return { latitude, longitude, source: "geopunt" };
  }
  return null;
}

type NominatimResponse = { lat?: string; lon?: string }[];

export function parseNominatimResult(body: NominatimResponse): GeocodeResult | null {
  for (const result of Array.isArray(body) ? body : []) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (inBelgium(latitude, longitude)) return { latitude, longitude, source: "nominatim" };
  }
  return null;
}

async function geopunt(address: HomeAddress): Promise<GeocodeResult | null> {
  const url = new URL(`https://${GEOPUNT_HOST}/geolocation/v4/Location`);
  url.searchParams.set("q", `${address.street} ${address.number}, ${address.postalCode} ${address.municipality}`);
  url.searchParams.set("c", "1");
  const body = await fetchJsonFromFixedHost<GeopuntResponse>(url.toString(), {
    allowedHosts: [GEOPUNT_HOST],
    timeoutMs: 6_000,
    maxBytes: 200_000,
  });
  return parseGeopuntResult(body, address.postalCode);
}

// Nominatim allows one request per second per application: chain the calls.
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function throttledNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + 1_100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastNominatimAt = Date.now();
    }
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

async function nominatim(address: HomeAddress): Promise<GeocodeResult | null> {
  const url = new URL(`https://${NOMINATIM_HOST}/search`);
  url.searchParams.set("street", `${address.number} ${address.street}`);
  url.searchParams.set("postalcode", address.postalCode);
  url.searchParams.set("city", address.municipality);
  url.searchParams.set("countrycodes", "be");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const body = await throttledNominatim(() =>
    fetchJsonFromFixedHost<NominatimResponse>(url.toString(), {
      allowedHosts: [NOMINATIM_HOST],
      timeoutMs: 8_000,
      maxBytes: 200_000,
      headers: { "Accept-Language": "nl,fr,en" },
    }),
  );
  return parseNominatimResult(body);
}

/**
 * Coordinates for a Belgian address: Geopunt first (outside Wallonia), then Nominatim. `null` when
 * neither found it; throws `OutboundError` only when every service that was tried failed.
 */
export async function geocodeAddress(address: HomeAddress): Promise<GeocodeResult | null> {
  let failure: OutboundError | null = null;
  if (!isWalloonPostalCode(address.postalCode)) {
    try {
      const found = await geopunt(address);
      if (found) return found;
    } catch (error) {
      if (!(error instanceof OutboundError)) throw error;
      console.warn(`Geocoding: ${error.message}`);
      failure = error;
    }
  }
  try {
    return await nominatim(address);
  } catch (error) {
    if (!(error instanceof OutboundError)) throw error;
    console.warn(`Geocoding: ${error.message}`);
    throw failure ?? error;
  }
}
