import { api } from "@/lib/api-client";
import type { Shop, ShopInput, ShopListQuery } from "../types/shops";

/** Shops visible to the household: the built-in catalogue plus its own, sorted by name. */
export function fetchShops(query: ShopListQuery = {}) {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.q) params.set("q", query.q);
  const search = params.toString();
  return api.get<Shop[]>(`/shops${search ? `?${search}` : ""}`);
}

export const fetchShop = (id: string) => api.get<Shop>(`/shops/${encodeURIComponent(id)}`);
export const createShop = (input: ShopInput) => api.post<Shop>("/shops", input);
export const updateShop = (id: string, input: ShopInput) => api.put<Shop>(`/shops/${encodeURIComponent(id)}`, input);
export const deleteShop = (id: string) => api.delete(`/shops/${encodeURIComponent(id)}`);
/** Looks for the shop's logo on its website again; resolves with the updated shop. */
export const refreshShopIcon = (id: string) => api.post<Shop>(`/shops/${encodeURIComponent(id)}/icon/refresh`);
/** Switches "Use for ingredient search" on or off for this household; resolves with the updated shop. */
export const setShopIngredientSearch = (id: string, enabled: boolean) =>
  api.put<Shop>(`/shops/${encodeURIComponent(id)}/ingredient-search`, { enabled });
