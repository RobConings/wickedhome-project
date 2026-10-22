import { useSelections, type UseSelectionsOptions } from "@/lib/selections";

/**
 * The current user's favourite and recently used contacts, shared by every contact picker and star on the page.
 * Call `recordUse(contactId)` after a form with a `ContactPicker` saves.
 */
export const useContactSelections = (options?: UseSelectionsOptions) => useSelections("contact", options);
