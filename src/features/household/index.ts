// Public API of the household feature. Routes, the app frame and other features import from here only.
export { HabitantAvatar } from "./components/habitant-avatar";
export { HabitantPicker } from "./components/habitant-picker";
export { habitantsAction, habitantsLoader } from "./data/household-loaders";
export { fetchHouseholdOverview } from "./data/household-requests";
export { HabitantsScreen } from "./screens/habitants-screen";
export { HABITANT_COLORS, canManageHabitants, type Habitant, type HouseholdOverview } from "./types/household";
// Household settings (name, home address + coordinates): the Settings page hosts the form.
export { HouseholdSettingsForm } from "./components/household-settings-form";
export {
  HOUSEHOLD_SETTINGS_INTENT,
  fetchHouseholdSettings,
  submitHouseholdSettings,
  type HouseholdSettingsActionResult,
} from "./data/household-settings-requests";
export {
  canManageHouseholdSettings,
  formatHomeAddress,
  mapUrl,
  type HomeAddress,
  type HomeLocation,
  type HouseholdSettings,
} from "./types/household-settings";
