import { useSelections, type UseSelectionsOptions } from "@/lib/selections";

/**
 * The current user's favourite and recently used products, shared by every product picker on the page.
 * Call `recordUse(productId)` after a form with a `ProductPicker` saves.
 */
export const useProductSelections = (options?: UseSelectionsOptions) => useSelections("product", options);
