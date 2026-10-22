import { WASTE_FRACTION_COLORS, type WasteDay, type WasteProviderInfo, type WasteSettings, type WasteSetup, type WasteSummary } from "@/features/waste/types/waste";
import { addDays } from "@/types/dates";

/** Same day as the other features' fixtures. */
export const WASTE_TODAY = "2026-10-02";

const limburg = (fraction: keyof typeof WASTE_FRACTION_COLORS, label: string) => ({
  fraction,
  label,
  color: WASTE_FRACTION_COLORS[fraction],
  note: null,
});

/** A Limburg.net street: residual, kitchen waste and PMD on Tuesdays, paper every other week. */
export const wasteDaysFixture: WasteDay[] = [
  { date: addDays(WASTE_TODAY, 1), collections: [limburg("pmd", "Pmd"), limburg("paper", "Papier & karton")] },
  { date: addDays(WASTE_TODAY, 4), collections: [limburg("residual", "Huisvuil"), limburg("organic", "Keukenafval")] },
  {
    date: addDays(WASTE_TODAY, 11),
    collections: [limburg("residual", "Huisvuil"), limburg("organic", "Gft"), limburg("textile", "Textiel")],
  },
  { date: addDays(WASTE_TODAY, 15), collections: [{ ...limburg("paper", "Papier & karton"), note: "Verplaatst door feestdag" }] },
];

export const wasteProvidersFixture: WasteProviderInfo[] = [
  { id: "limburg-net", name: "Limburg.net", website: "https://limburg.net/afvalkalender", postalCodeRanges: [[3500, 3999]], checksCoverage: false },
  { id: "recycle-app", name: "Recycle! (Fost Plus)", website: "https://www.recycleapp.be", postalCodeRanges: null, checksCoverage: true },
];

export const wasteSetupFixture: WasteSetup = {
  providerId: "limburg-net",
  providerName: "Limburg.net",
  addressLabel: "Kempische steenweg 100, Hasselt",
  lastSyncAt: `${WASTE_TODAY}T04:12:00.000Z`,
  lastSyncStatus: "ok",
  lastSyncError: null,
  lastSuccessAt: `${WASTE_TODAY}T04:12:00.000Z`,
  tasks: { enabled: true, timing: "evening_before", assigneeIds: [], rotate: true },
};

export const failedWasteSetupFixture: WasteSetup = {
  ...wasteSetupFixture,
  lastSyncAt: `${WASTE_TODAY}T16:00:00.000Z`,
  lastSyncStatus: "error",
  lastSyncError: "limburg.net answered 503",
};

export const wasteSettingsFixture: WasteSettings = {
  setup: wasteSetupFixture,
  providers: wasteProvidersFixture,
  suggestedProviderId: "limburg-net",
  upcoming: wasteDaysFixture,
};

export const unconfiguredWasteSettingsFixture: WasteSettings = { ...wasteSettingsFixture, setup: null, upcoming: [] };

export const wasteSummaryFixture: WasteSummary = { setup: wasteSetupFixture, upcoming: wasteDaysFixture.slice(0, 3) };
/** The next collection is today. */
export const wasteTodaySummaryFixture: WasteSummary = {
  setup: wasteSetupFixture,
  upcoming: [{ ...wasteDaysFixture[0]!, date: WASTE_TODAY }, ...wasteDaysFixture.slice(1, 3)],
};
/** The next collection is next week. */
export const wasteLaterSummaryFixture: WasteSummary = { setup: wasteSetupFixture, upcoming: wasteDaysFixture.slice(1, 4) };
export const unconfiguredWasteSummaryFixture: WasteSummary = { setup: null, upcoming: [] };
export const failedWasteSummaryFixture: WasteSummary = { setup: failedWasteSetupFixture, upcoming: [] };

/** A lookup at Limburg.net that found two numbers with an addition. */
export const wasteLookupMatchesFixture = [
  { label: "Kempische steenweg 100A, Hasselt", address: { nisCode: "71072", municipality: "Hasselt", streetId: "33870", street: "Kempische steenweg", houseNumber: "100", addition: "A" } },
  { label: "Kempische steenweg 100B, Hasselt", address: { nisCode: "71072", municipality: "Hasselt", streetId: "33870", street: "Kempische steenweg", houseNumber: "100", addition: "B" } },
];
