import { useSelections, type UseSelectionsOptions } from "@/lib/selections";

/**
 * The current user's favourite and recently used shops, shared by every shop picker and star on the page.
 * Call `recordUse(shopId)` after a form with a `ShopPicker` saves.
 */
export const useShopSelections = (options?: UseSelectionsOptions) => useSelections("shop", options);
