import { createShoppingItem, fetchShoppingItems } from "@/features/shopping";
import type { StockItem } from "../types/inventory";
import { productAlreadyOnList } from "../types/product-workspace";
import type { StocktakeProduct } from "../types/stocktake";

export type StocktakeShoppingResult = "added" | "already_listed";

/** Add an explicit need without leaving the count or changing stock; reuse an open shared-group need. */
export async function addStocktakeShoppingItem(item: StockItem, quantity: number, products: readonly StocktakeProduct[]): Promise<StocktakeShoppingResult> {
  const open = await fetchShoppingItems({ status: "open" });
  if (productAlreadyOnList(item.productId, products, open)) return "already_listed";
  await createShoppingItem({ productId: item.productId, quantity, unit: item.unit, source: "manual" });
  return "added";
}
