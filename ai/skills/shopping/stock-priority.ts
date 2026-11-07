import { shoppingStockNeed, type ShoppingStockStatus } from "@/features/shopping/types/shopping";

/** Shared replenishment forecast: neither marks an item bought nor excludes nice-to-haves. */
export function stockPriority(stockStatus: ShoppingStockStatus | null, essential: boolean | null, bought = false) {
  const stockNeed = shoppingStockNeed(stockStatus, essential);
  return {
    stockNeed,
    stockStatus,
    buyingAdvice: bought ? null : stockNeed === "out" ? "to_buy" : stockNeed === "nearly_out" ? "warning" : null,
    essential,
    importance: essential === null ? null : essential ? "essential" : "nice_to_have",
  };
}
