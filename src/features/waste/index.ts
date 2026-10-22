// Public API of the waste feature. Routes, the app frame and other features import from here only.
// Collection days come from the household's collector (src/api/waste/providers), synced daily on the
// server; they also appear on the calendar through the "waste" calendar source.
export { WasteCard, WasteCardSkeleton } from "./components/waste-card";
export { WasteCollectionChip, WasteFractionIcon } from "./components/waste-fraction-icon";
export { WasteSettingsSection } from "./components/waste-settings-section";
export type { WasteAddressDefaults } from "./components/waste-setup-form";
export {
  WASTE_INTENTS,
  fetchWasteCollections,
  fetchWasteSettings,
  fetchWasteSummary,
  isWasteIntent,
  submitWasteSettings,
  type WasteActionResult,
  type WasteIntent,
} from "./data/waste-requests";
export {
  canManageWaste,
  type WasteDay,
  type WasteFraction,
  type WasteSettings,
  type WasteSetup,
  type WasteSummary,
} from "./types/waste";
