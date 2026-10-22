import { api, resourcePath, withQuery } from "@/lib/api-client";
import type {
  ProductStock,
  ScanResult,
  StockChangeResult,
  StockItem,
  StockItemInput,
  StockItemUpdateInput,
  StockMovementInput,
} from "../types/inventory";

const stockPath = resourcePath("/inventory/stock");

/** Stock items, low stock first. Filter by place or product. */
export function fetchStock(filter: { placeId?: string; productId?: string } = {}) {
  return api.get<StockItem[]>(withQuery("/inventory/stock", { placeId: filter.placeId, productId: filter.productId }));
}

export const createStockItem = (input: StockItemInput) => api.post<StockItem>("/inventory/stock", input);
export const updateStockItem = (id: string, input: StockItemUpdateInput) =>
  api.put<StockChangeResult>(stockPath(id), input);
export const deleteStockItem = (id: string) => api.delete(stockPath(id));
export const addStockMovement = (id: string, input: StockMovementInput) =>
  api.post<StockChangeResult>(stockPath(id, "movements"), input);
export const fetchProductStock = (productId: string) => api.get<ProductStock>(resourcePath("/inventory/products")(productId));
export const scanCode = (code: string) => api.get<ScanResult>(`/inventory/scan?code=${encodeURIComponent(code)}`);
