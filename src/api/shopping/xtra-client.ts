import { z } from "zod";
import type { XtraCredentials, XtraListItem } from "@/features/shopping/types/xtra";
import { normalizeBarcode } from "@/features/shopping/types/barcode-lookup";
import { HttpError } from "../lib/http";

// Protocol facts from the example's HTTP captures; this implementation does not vendor its Python code.
const LIST_ORIGIN = "https://apix.colruyt.be/gateway/emec.colruyt.bffsvc/cg/";
const SEARCH_URL = "https://apip.colruyt.be/gateway/emec.colruyt.protected.bffsvc/cg/nl/api/product-search-prs";
const productSchema = z.object({
  technicalArticleNumber: z.string().regex(/^\d{1,24}$/), name: z.string().min(1).max(500),
  LongName: z.string().nullish(), brand: z.string().nullish(), content: z.string().nullish(),
  commercialArticleNumber: z.string().regex(/^\d+$/).nullish(), thumbNail: z.string().nullish(),
  GTIN: z.array(z.string()).nullish(), OrderUnit: z.string().nullish(),
  isPriceAvailable: z.boolean().optional(),
  price: z.object({ basicPrice: z.number().finite().nonnegative().max(1_000_000) }).nullish(),
});
const listItemSchema = z.object({
  id: z.uuid(), description: z.string().max(1000),
  productData: z.object({ productId: z.string().max(100), quantity: z.number().finite().nonnegative(), unitCode: z.string().max(30) }).nullish(),
  completedAt: z.union([z.string(), z.number()]).nullish(),
});
const itemsSchema = z.array(listItemSchema).max(10000);
const listSchema = z.union([
  z.object({ getListItems: z.object({ data: itemsSchema }) }),
  z.object({ data: z.object({ items: itemsSchema }) }),
  z.object({ items: itemsSchema }),
]);
type RawProduct = z.infer<typeof productSchema>;
export function mapXtraProduct(raw: RawProduct) {
  let imageUrl: string | null = null;
  try { const url = new URL(raw.thumbNail ?? ""); if (url.protocol === "https:" && url.hostname === "static.colruytgroup.com" && !url.username && !url.password) imageUrl = url.href; } catch { /* Missing or untrusted image. */ }
  return {
    productId: raw.technicalArticleNumber,
    name: (raw.LongName || raw.name).slice(0, 120), brand: raw.brand?.slice(0, 80) || null,
    content: raw.content?.slice(0, 200) || null, imageUrl,
    barcode: raw.GTIN?.map(normalizeBarcode).find((value) => value !== null) ?? null,
    priceCents: raw.isPriceAvailable !== false && raw.price ? Math.round(raw.price.basicPrice * 100) : null,
    unit: raw.OrderUnit ?? null,
    url: raw.commercialArticleNumber ? `https://www.colruyt.be/nl/producten/${raw.commercialArticleNumber}` : null,
  };
}
export function parseXtraList(raw: unknown): XtraListItem[] {
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(502, "xtra_format", "Colruyt returned an unfamiliar shopping-list format. No further action was taken.");
  const value = parsed.data;
  const items = "getListItems" in value ? value.getListItems.data : "data" in value ? value.data.items : value.items;
  return items.map((item) => ({ id: item.id, name: item.description, productId: item.productData?.productId ?? null, quantity: item.productData?.quantity ?? null, unit: item.productData?.unitCode ?? null, completed: item.completedAt !== null && item.completedAt !== undefined && item.completedAt !== "" }));
}

export class XtraClient {
  constructor(private readonly credentials: XtraCredentials, private readonly signal: AbortSignal) {}

  private async request(url: URL, method = "GET", body?: unknown): Promise<unknown> {
    const cookie = `clpbff_session=${this.credentials.sessionId}${this.credentials.reese84 ? `; reese84=${this.credentials.reese84}` : ""}`;
    const signal = AbortSignal.any([this.signal, AbortSignal.timeout(20_000)]);
    try {
      const response = await fetch(url, {
        method, redirect: "error", signal,
        headers: { Accept: "application/json", "x-cg-apikey": this.credentials.apiKey, Cookie: cookie, Origin: "https://www.colruyt.be", Referer: "https://www.colruyt.be/", ...(this.credentials.userAgent && { "User-Agent": this.credentials.userAgent }), ...(body !== undefined && { "Content-Type": "application/json" }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      if ([401, 403, 456].includes(response.status)) { await response.body?.cancel(); throw new HttpError(409, "xtra_reconnect", "Colruyt requires a new login or browser verification. Ask the connection manager to reconnect Xtra in Settings."); }
      if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, "xtra_upstream", `Colruyt could not complete the request (HTTP ${response.status}).`); }
      if (method === "DELETE" && response.status === 204) return null;
      if (!response.headers.get("content-type")?.includes("application/json")) { await response.body?.cancel(); throw new HttpError(409, "xtra_reconnect", "Colruyt returned a login or verification page. Reconnect Xtra in Settings."); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty body");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 2_000_000) throw new Error("response too large"); chunks.push(next.value); }
      } finally { await reader.cancel().catch(() => undefined); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (this.signal.aborted) throw new HttpError(499, "xtra_cancelled", "Xtra request cancelled.");
      // Do not propagate fetch errors, headers, URLs or response bodies into logs or tool results.
      throw new HttpError(502, "xtra_unavailable", "Colruyt could not be reached or returned an unreadable response. Try again later.");
    }
  }

  async search(query: string) {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({ searchTerm: query, placeId: this.credentials.placeId, size: "25", sort: "relevancy desc", isAvailable: "true", skip: "0" }).toString();
    const parsed = z.object({ products: z.array(productSchema).max(100) }).safeParse(await this.request(url));
    if (!parsed.success) throw new HttpError(502, "xtra_format", "Colruyt returned an unfamiliar product format.");
    return parsed.data.products.map(mapXtraProduct);
  }

  async list(limit: number, offset: number) {
    const url = new URL("latest-shopping-list", LIST_ORIGIN);
    url.search = new URLSearchParams({ limit: String(limit), offset: String(offset), sort: "createdAt desc", placeId: this.credentials.placeId, lang: "nl", prs: "true" }).toString();
    return parseXtraList(await this.request(url));
  }

  async add(id: string, product: { productId: string; name: string }, quantity: number) {
    const now = new Date().toISOString();
    const result = parseXtraList(await this.request(new URL("add-items-to-list", LIST_ORIGIN), "POST", { items: [{ id, description: product.name, createdAt: now, updatedAt: now, completedAt: null, productData: { productId: product.productId, quantity, unitCode: "P" } }] }));
    const item = result.find((candidate) => candidate.id === id && candidate.productId === product.productId && candidate.quantity === quantity && !candidate.completed);
    if (!item) throw new HttpError(502, "xtra_unverified", "Colruyt did not acknowledge the exact requested list item.");
    return item;
  }

  async remove(itemId: string) {
    z.uuid().parse(itemId);
    await this.request(new URL(`remove-item-from-list/${itemId}`, LIST_ORIGIN), "DELETE");
    for (let offset = 0; offset < 1275; offset += 255) {
      const items = await this.list(255, offset);
      if (items.some((item) => item.id === itemId)) throw new HttpError(502, "xtra_unverified", "The removed item is still present on the Xtra list.");
      if (items.length < 255) return;
    }
    throw new HttpError(502, "xtra_unverified", "The Xtra list is too large to verify this removal.");
  }
}
