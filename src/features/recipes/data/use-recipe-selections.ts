import { useSelections, type UseSelectionsOptions } from "@/lib/selections";

/** The current user's favourite and recently used recipes (favourites go on top of "All recipes"). */
export const useRecipeSelections = (options?: UseSelectionsOptions) => useSelections("recipe", options);
