import { useSelections, type UseSelectionsOptions } from "@/lib/selections";

/**
 * The current user's favourite and recently used places, shared by every place picker on the page.
 * Call `recordUse(placeId)` after a form with a `PlacePicker` saves.
 */
export const usePlaceSelections = (options?: UseSelectionsOptions) => useSelections("place", options);
