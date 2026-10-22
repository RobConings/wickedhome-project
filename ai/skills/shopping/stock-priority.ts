import type { ShoppingStockStatus } from "@/features/shopping/types/shopping";

/** Advice and importance remain separate: neither marks an item bought nor excludes nice-to-haves. */
export function stockPriority(stockStatus: ShoppingStockStatus | null, essential: boolean | null, bought = false) {
  return {
    stockStatus,
    buyingAdvice: bought ? null : stockStatus === "below_minimum" ? "to_buy" : stockStatus === "at_minimum" ? "warning" : null,
    essential,
    importance: essential === null ? null : essential ? "essential" : "nice_to_have",
  };
}
