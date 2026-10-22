import { api, restResource } from "@/lib/api-client";
import type { Shop, ShopInput, ShopListQuery } from "../types/shops";

const shops = restResource<Shop, ShopInput>("/shops");

/** Shops visible to the household: the built-in catalogue plus its own, sorted by name. */
export const fetchShops = (query: ShopListQuery = {}) => shops.list({ type: query.type, q: query.q });

export const fetchShop = shops.get;
export const createShop = shops.create;
export const updateShop = shops.update;
export const deleteShop = shops.remove;
/** Looks for the shop's logo on its website again; resolves with the updated shop. */
export const refreshShopIcon = (id: string) => api.post<Shop>(shops.path(id, "icon", "refresh"));
/** Switches "Use for ingredient search" on or off for this household; resolves with the updated shop. */
export const setShopIngredientSearch = (id: string, enabled: boolean) =>
  api.put<Shop>(shops.path(id, "ingredient-search"), { enabled });
/** Shops, or none when the request fails: for other features that only need them for a picker or logos. */
export const fetchShopsOrEmpty = () => fetchShops().catch((): Shop[] => []);
