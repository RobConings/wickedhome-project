import type { StockPurchaseReview, StockPurchaseInput } from "../types/purchases";
import { api } from "@/lib/api-client";
import type {
  ProductStock,
  ScanResult,
  StockChangeResult,
  StockItem,
  StockItemInput,
  StockItemUpdateInput,
  StockMovementInput,
  StockCountInput,
  StockCountExclusionInput,
} from "../types/inventory";

const enc = encodeURIComponent;

/** Stock items, low stock first. Filter by place or product. */
export function fetchStock(filter: { placeId?: string; productId?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.placeId) params.set("placeId", filter.placeId);
  if (filter.productId) params.set("productId", filter.productId);
  const query = params.toString();
  return api.get<StockItem[]>(`/inventory/stock${query ? `?${query}` : ""}`);
}

export const createStockItem = (input: StockItemInput) => api.post<StockItem>("/inventory/stock", input);
export const updateStockItem = (id: string, input: StockItemUpdateInput) =>
  api.put<StockChangeResult>(`/inventory/stock/${enc(id)}`, input);
export const deleteStockItem = (id: string) => api.delete(`/inventory/stock/${enc(id)}`);
export const addStockMovement = (id: string, input: StockMovementInput) =>
  api.post<StockChangeResult>(`/inventory/stock/${enc(id)}/movements`, input);
export const saveStockCount = (id: string, input: StockCountInput) =>
  api.put<StockChangeResult>(`/inventory/stock/${enc(id)}/count`, input);
export const saveStockCountExclusion = (id: string, input: StockCountExclusionInput) =>
  api.put<StockItem>(`/inventory/stock/${enc(id)}/count-exclusion`, input);
export const fetchProductStock = (productId: string) => api.get<ProductStock>(`/inventory/products/${enc(productId)}`);
export const scanCode = (code: string) => api.get<ScanResult>(`/inventory/scan?code=${enc(code)}`);

export const fetchPurchaseReview = (id: string) => api.get<StockPurchaseReview>(`/inventory/stock/${enc(id)}/purchases`);
export const recordStockPurchase = (id: string, input: StockPurchaseInput) => api.post<StockChangeResult>(`/inventory/stock/${enc(id)}/purchases`, input);
