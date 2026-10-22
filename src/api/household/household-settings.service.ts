import type {
  GeocodeOutcome,
  HomeAddress,
  HomeLocation,
  HouseholdSettings,
  HouseholdSettingsInput,
  HouseholdSettingsResult,
  LocationSource,
} from "@/features/household/types/household-settings";
import { HOUSEHOLD_TIME_ZONE } from "@/types/dates";
import { db, type Household, type HouseholdLocationSource } from "../lib/db";
import { geocodeAddress } from "./geocoding";

const toSource = (source: HouseholdLocationSource) => source.toLowerCase() as LocationSource;
const fromSource = (source: LocationSource) => source.toUpperCase() as HouseholdLocationSource;

function toAddress(row: Household): HomeAddress | null {
  if (!row.addressStreet || !row.addressNumber || !row.addressPostalCode || !row.addressMunicipality) return null;
  return {
    street: row.addressStreet,
    number: row.addressNumber,
    box: row.addressBox,
    postalCode: row.addressPostalCode,
    municipality: row.addressMunicipality,
    country: row.addressCountry,
  };
}

function toLocation(row: Household): HomeLocation | null {
  if (row.latitude === null || row.longitude === null) return null;
  return { latitude: row.latitude, longitude: row.longitude, source: row.locationSource ? toSource(row.locationSource) : "manual" };
}

function toSettings(row: Household): HouseholdSettings {
  return { name: row.name, address: toAddress(row), location: toLocation(row), timeZone: HOUSEHOLD_TIME_ZONE };
}

export async function getHouseholdSettings(householdId: string): Promise<HouseholdSettings> {
  return toSettings(await db.household.findUniqueOrThrow({ where: { id: householdId } }));
}

/** The home's coordinates, for features that need them (weather). `null` without a location. */
export async function getHomeLocation(householdId: string): Promise<HomeLocation | null> {
  const row = await db.household.findUnique({ where: { id: householdId } });
  return row ? toLocation(row) : null;
}

const sameAddress = (a: HomeAddress | null, b: HomeAddress | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.street.toLowerCase() === b.street.toLowerCase() &&
    a.number.toLowerCase() === b.number.toLowerCase() &&
    a.postalCode === b.postalCode &&
    a.municipality.toLowerCase() === b.municipality.toLowerCase());

/**
 * Saves the name and address. Coordinates: manual ones are stored as given; otherwise a changed address
 * is geocoded (an unchanged one keeps its coordinates). A failed or empty geocode still saves the
 * address, without coordinates, and says so in `geocode`.
 */
export async function saveHouseholdSettings(householdId: string, input: HouseholdSettingsInput): Promise<HouseholdSettingsResult> {
  const current = await db.household.findUniqueOrThrow({ where: { id: householdId } });
  const previous = toAddress(current);
  const address: HomeAddress | null =
    input.street && input.number && input.postalCode && input.municipality
      ? {
          street: input.street,
          number: input.number,
          box: input.box || null,
          postalCode: input.postalCode,
          municipality: input.municipality,
          country: "BE",
        }
      : null;

  let location: HomeLocation | null = null;
  let geocode: GeocodeOutcome;
  if (input.locationMode === "manual" && input.latitude != null && input.longitude != null) {
    location = { latitude: input.latitude, longitude: input.longitude, source: "manual" };
    geocode = "manual";
  } else if (!address) {
    geocode = "cleared";
  } else if (sameAddress(address, previous) && toLocation(current) && current.locationSource !== "MANUAL") {
    location = toLocation(current);
    geocode = "kept";
  } else {
    try {
      const found = await geocodeAddress(address);
      location = found;
      geocode = found ? "found" : "not_found";
    } catch {
      geocode = "failed";
    }
  }

  const row = await db.household.update({
    where: { id: householdId },
    data: {
      name: input.name,
      addressStreet: address?.street ?? null,
      addressNumber: address?.number ?? null,
      addressBox: address?.box ?? null,
      addressPostalCode: address?.postalCode ?? null,
      addressMunicipality: address?.municipality ?? null,
      addressCountry: "BE",
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      locationSource: location ? fromSource(location.source) : null,
    },
  });
  return { settings: toSettings(row), geocode };
}
