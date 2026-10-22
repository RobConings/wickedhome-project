import type { HouseholdSettings } from "@/features/household/types/household-settings";

/** A household in Hasselt whose address was found in the Flemish address register. */
export const householdSettingsFixture: HouseholdSettings = {
  name: "Coppens",
  address: { street: "Grote Markt", number: "1", box: null, postalCode: "3500", municipality: "Hasselt", country: "BE" },
  location: { latitude: 50.929465, longitude: 5.33703, source: "geopunt" },
  timeZone: "Europe/Brussels",
};

/** Saved, but no geocoder found the address. */
export const unlocatedHouseholdSettingsFixture: HouseholdSettings = { ...householdSettingsFixture, location: null };

/** Coordinates entered by hand. */
export const manualHouseholdSettingsFixture: HouseholdSettings = {
  ...householdSettingsFixture,
  location: { latitude: 50.93, longitude: 5.338, source: "manual" },
};

/** A new household without an address. */
export const emptyHouseholdSettingsFixture: HouseholdSettings = { ...householdSettingsFixture, address: null, location: null };
