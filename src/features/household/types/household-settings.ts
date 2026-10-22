import { z } from "zod";
import type { HOUSEHOLD_TIME_ZONE } from "@/types/dates";

/**
 * Household settings: the household's name and the home address with its coordinates. The coordinates
 * feed the weather forecast and map links; the address is also the starting point for the waste
 * collector lookup. `GET /api/household/settings`, `PUT /api/household/settings`.
 */

/** Rough bounding box of Belgium with a small margin: catches swapped or mistyped coordinates. */
export const BELGIUM_BOUNDS = { minLatitude: 49.4, maxLatitude: 51.6, minLongitude: 2.4, maxLongitude: 6.5 } as const;

export const LOCATION_SOURCES = ["geopunt", "nominatim", "manual"] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const LOCATION_MODES = ["auto", "manual"] as const;
export type LocationMode = (typeof LOCATION_MODES)[number];

/** Accepts numbers and strings with a decimal comma ("50,9295") as typed in nl-BE. */
const decimal = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? Number(value.trim().replace(",", ".")) : value),
    z.number().min(min).max(max),
  );

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

/**
 * Error messages this schema produces itself. They are codes, not text: the form translates them
 * (`household:settings.errors.<code>`).
 */
export const HOUSEHOLD_SETTINGS_ERROR_CODES = ["addressIncomplete", "coordinatesRequired"] as const;

/**
 * Body of `PUT /api/household/settings`, flat so the same schema validates the settings form. Leave every
 * address field empty to remove the address. `locationMode: "auto"` geocodes the address on the server;
 * `"manual"` stores the given coordinates as they are.
 */
export const householdSettingsInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    street: optionalText(120),
    number: optionalText(12),
    box: optionalText(12),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional()
      .nullable(),
    municipality: optionalText(80),
    locationMode: z.enum(LOCATION_MODES).default("auto"),
    latitude: decimal(BELGIUM_BOUNDS.minLatitude, BELGIUM_BOUNDS.maxLatitude).optional().nullable(),
    longitude: decimal(BELGIUM_BOUNDS.minLongitude, BELGIUM_BOUNDS.maxLongitude).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const parts = { street: value.street, number: value.number, postalCode: value.postalCode, municipality: value.municipality };
    const filled = Object.values(parts).some(Boolean) || Boolean(value.box);
    if (filled) {
      for (const [key, part] of Object.entries(parts)) {
        if (!part) ctx.addIssue({ code: "custom", path: [key], message: "addressIncomplete" });
      }
    }
    if (value.locationMode === "manual") {
      if (value.latitude == null) ctx.addIssue({ code: "custom", path: ["latitude"], message: "coordinatesRequired" });
      if (value.longitude == null) ctx.addIssue({ code: "custom", path: ["longitude"], message: "coordinatesRequired" });
    }
  });
export type HouseholdSettingsInput = z.infer<typeof householdSettingsInputSchema>;

export type HomeAddress = {
  street: string;
  number: string;
  box: string | null;
  postalCode: string;
  municipality: string;
  /** ISO 3166-1 alpha-2; always "BE" for now. */
  country: string;
};

export type HomeLocation = {
  latitude: number;
  longitude: number;
  source: LocationSource;
};

export type HouseholdSettings = {
  name: string;
  address: HomeAddress | null;
  location: HomeLocation | null;
  /** The household time zone; fixed for now. */
  timeZone: typeof HOUSEHOLD_TIME_ZONE;
};

/**
 * What happened to the coordinates on save: found by a geocoder, entered by hand, kept (address
 * unchanged), not found or failed (address saved without coordinates), or cleared with the address.
 */
export const GEOCODE_OUTCOMES = ["found", "manual", "kept", "not_found", "failed", "cleared"] as const;
export type GeocodeOutcome = (typeof GEOCODE_OUTCOMES)[number];

export type HouseholdSettingsResult = {
  settings: HouseholdSettings;
  geocode: GeocodeOutcome;
};

/** "Grote Markt 1 bus 2, 3500 Hasselt". `boxLabel` is the localised word for "bus". */
export function formatHomeAddress(address: HomeAddress, boxLabel = "bus"): string {
  const box = address.box ? ` ${boxLabel} ${address.box}` : "";
  return `${address.street} ${address.number}${box}, ${address.postalCode} ${address.municipality}`;
}

/** OpenStreetMap link centred on the coordinates, with a marker. */
export function mapUrl(location: Pick<HomeLocation, "latitude" | "longitude">, zoom = 18): string {
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

/** Adults and owners change household settings; children look. Mirrors the API's role check. */
export const canManageHouseholdSettings = (role: "owner" | "adult" | "child") => role !== "child";
