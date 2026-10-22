import { api, resourcePath, withQuery } from "@/lib/api-client";
import type {
  LinkPreview,
  Product,
  ProductAlternativeInput,
  ProductInput,
  ProductQuery,
  ProductShopLinkInput,
  RestockInput,
  ShoppingItem,
  ShoppingItemCreateInput,
  ShoppingItemQuery,
  ShoppingItemUpdateInput,
  ShoppingItemUpdateResult,
  ShoppingListInput,
  ShoppingOverview,
  ShoppingStaple,
  ShoppingSummary,
  StapleInput,
} from "../types/shopping";
import type { BarcodeLookupResult } from "../types/barcode-lookup";

const itemPath = resourcePath("/shopping/items");
const listPath = resourcePath("/shopping/lists");
const staplePath = resourcePath("/shopping/staples");
const productPath = resourcePath("/shopping/products");

/** Lists, open (and just-bought) items and staples. Due staples are put back on their list first. */
export const fetchShoppingOverview = () => api.get<ShoppingOverview>("/shopping");

export const fetchShoppingItems = (query: ShoppingItemQuery = {}) =>
  api.get<ShoppingItem[]>(withQuery("/shopping/items", query));
/** How many items are left to buy, e.g. for the dashboard. */
export async function fetchShoppingSummary(): Promise<ShoppingSummary> {
  const items = await fetchShoppingItems({ status: "open" });
  return { open: items.length, shops: new Set(items.flatMap((item) => (item.shopId ? [item.shopId] : []))).size };
}

export const createShoppingItem = (input: Partial<ShoppingItemCreateInput>) =>
  api.post<ShoppingItem>("/shopping/items", input);
export const updateShoppingItem = (id: string, input: ShoppingItemUpdateInput) =>
  api.patch<ShoppingItemUpdateResult>(itemPath(id), input);
export const deleteShoppingItem = (id: string) => api.delete(itemPath(id));
export const restockShoppingItem = (id: string, input: RestockInput) =>
  api.post(itemPath(id, "restock"), input);
export const fetchLinkPreview = (url: string) => api.post<LinkPreview>("/shopping/link-preview", { url });

export const createShoppingList = (input: ShoppingListInput) => api.post<{ id: string }>("/shopping/lists", input);
export const updateShoppingList = (id: string, input: ShoppingListInput) =>
  api.put<{ id: string }>(listPath(id), input);
export const deleteShoppingList = (id: string) => api.delete(listPath(id));

export const createStaple = (input: StapleInput) => api.post<ShoppingStaple>("/shopping/staples", input);
export const updateStaple = (id: string, input: StapleInput) => api.put<ShoppingStaple>(staplePath(id), input);
export const deleteStaple = (id: string) => api.delete(staplePath(id));

/** The household's product catalogue, sorted by name. `code` finds a product by barcode or QR code. */
export const fetchProducts = (query: ProductQuery = {}) => api.get<Product[]>(withQuery("/shopping/products", query));
export const fetchProduct = (id: string) => api.get<Product>(productPath(id));
export const createProduct = (input: ProductInput) => api.post<Product>("/shopping/products", input);
export const updateProduct = (id: string, input: ProductInput) => api.put<Product>(productPath(id), input);
export const deleteProduct = (id: string) => api.delete(productPath(id));
export const upsertProductLink = (id: string, input: ProductShopLinkInput) =>
  api.put<Product>(productPath(id, "links"), input);
export const deleteProductLink = (id: string, shopId: string) =>
  api.delete<Product>(productPath(id, "links", shopId));
/** Alternatives: `id` shares the stock of `input.mainProductId` (or of a new generic product `newMainName`). */
export const linkProductAlternative = (id: string, input: ProductAlternativeInput) =>
  api.put<Product>(productPath(id, "alternative"), input);
/** Takes an alternative out of its group; the stock stays with the main product. */
export const unlinkProductAlternative = (id: string) => api.delete<Product>(productPath(id, "alternative"));

/** Barcode auto-fill: what a (valid) barcode is, if known. Never rejects for "unknown": see `status`. */
export const lookupBarcode = (code: string) => api.get<BarcodeLookupResult>(resourcePath("/shopping/barcode")(code));
