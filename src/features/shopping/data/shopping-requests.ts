import { api } from "@/lib/api-client";
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

const enc = encodeURIComponent;

function search(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Lists, open (and just-bought) items and staples. Due staples are put back on their list first. */
export const fetchShoppingOverview = () => api.get<ShoppingOverview>("/shopping");

export const fetchShoppingItems = (query: ShoppingItemQuery = {}) =>
  api.get<ShoppingItem[]>(`/shopping/items${search(query)}`);
/** How many items are left to buy, e.g. for the dashboard. */
export async function fetchShoppingSummary(): Promise<ShoppingSummary> {
  const items = await fetchShoppingItems({ status: "open" });
  return { open: items.length, shops: new Set(items.flatMap((item) => (item.shopId ? [item.shopId] : []))).size };
}

export const createShoppingItem = (input: Partial<ShoppingItemCreateInput>) =>
  api.post<ShoppingItem>("/shopping/items", input);
export const updateShoppingItem = (id: string, input: ShoppingItemUpdateInput) =>
  api.patch<ShoppingItemUpdateResult>(`/shopping/items/${enc(id)}`, input);
export const deleteShoppingItem = (id: string) => api.delete(`/shopping/items/${enc(id)}`);
export const restockShoppingItem = (id: string, input: RestockInput) =>
  api.post(`/shopping/items/${enc(id)}/restock`, input);
export const fetchLinkPreview = (url: string) => api.post<LinkPreview>("/shopping/link-preview", { url });

export const createShoppingList = (input: ShoppingListInput) => api.post<{ id: string }>("/shopping/lists", input);
export const updateShoppingList = (id: string, input: ShoppingListInput) =>
  api.put<{ id: string }>(`/shopping/lists/${enc(id)}`, input);
export const deleteShoppingList = (id: string) => api.delete(`/shopping/lists/${enc(id)}`);

export const createStaple = (input: StapleInput) => api.post<ShoppingStaple>("/shopping/staples", input);
export const updateStaple = (id: string, input: StapleInput) => api.put<ShoppingStaple>(`/shopping/staples/${enc(id)}`, input);
export const deleteStaple = (id: string) => api.delete(`/shopping/staples/${enc(id)}`);

/** The household's product catalogue, sorted by name. `code` finds a product by barcode or QR code. */
export const fetchProducts = (query: ProductQuery = {}) => api.get<Product[]>(`/shopping/products${search(query)}`);
export const fetchProduct = (id: string) => api.get<Product>(`/shopping/products/${enc(id)}`);
export const createProduct = (input: ProductInput) => api.post<Product>("/shopping/products", input);
export const updateProduct = (id: string, input: ProductInput) => api.put<Product>(`/shopping/products/${enc(id)}`, input);
export const deleteProduct = (id: string) => api.delete(`/shopping/products/${enc(id)}`);
export const upsertProductLink = (id: string, input: ProductShopLinkInput) =>
  api.put<Product>(`/shopping/products/${enc(id)}/links`, input);
export const deleteProductLink = (id: string, shopId: string) =>
  api.delete<Product>(`/shopping/products/${enc(id)}/links/${enc(shopId)}`);
/** Alternatives: `id` shares the stock of `input.mainProductId` (or of a new generic product `newMainName`). */
export const linkProductAlternative = (id: string, input: ProductAlternativeInput) =>
  api.put<Product>(`/shopping/products/${enc(id)}/alternative`, input);
/** Takes an alternative out of its group; the stock stays with the main product. */
export const unlinkProductAlternative = (id: string) => api.delete<Product>(`/shopping/products/${enc(id)}/alternative`);

/** Barcode auto-fill: what a (valid) barcode is, if known. Never rejects for "unknown": see `status`. */
export const lookupBarcode = (code: string) => api.get<BarcodeLookupResult>(`/shopping/barcode/${enc(code)}`);
