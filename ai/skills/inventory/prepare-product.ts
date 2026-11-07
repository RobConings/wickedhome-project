import { compatibleProductType } from "@/features/shopping/types/product-identity";
import { z } from "zod";
import { productImageUrlSchema, type Product } from "@/features/shopping/types/shopping";
import { shopForUrl } from "@/features/shopping/types/shop-links";
import { packageSizeFromName } from "@/api/shopping/barcode-lookup";
import { listProducts } from "@/api/shopping/shopping.service";
import { listShops } from "@/api/shops/shops.service";
import { isWebSearchConfigured, readPage, searchWeb, siteDomain, type WebPage } from "@/api/web/web.service";
import { entityRef, money, registerAssistantTool } from "@ai/core/kit";
import { scoreCandidates } from "@ai/core/resolve";
import { rememberOffer, type Offer } from "../recipes/offers";
import { UNTRUSTED_NOTE } from "../web/tools";

/** A verified product page can carry its metadata through save without the model retyping it. */
export function productFacts(page: WebPage) {
  const product = page.product;
  if (!product?.name) return null;
  const image = product.imageUrl ?? page.imageUrl;
  const size = packageSizeFromName(product.name);
  const barcode = product.ean && /^\d{6,14}$/.test(product.ean) ? product.ean : null;
  return {
    name: product.name.slice(0, 120), brand: product.brand, url: page.url,
    imageUrl: image && productImageUrlSchema.safeParse(image).success ? image : null,
    // A non-euro (or unlabelled) price must not silently become a euro price.
    priceCents: product.currency === "EUR" && product.price !== null ? Math.round(product.price * 100) : null,
    currency: product.currency,
    barcode, packageAmount: size?.amount ?? null, packageUnit: size?.unit ?? null,
  };
}

registerAssistantTool({
  name: "inventory.prepare_product",
  description: "Before adding a product or linking it to groceries: compare existing catalogue products/alternatives, then proactively try online enrichment (photo, exact product link, shop, price, barcode, package size). No need to ask permission to research. Pass a known URL to read it even without server search. Returns reusable offer tokens for known shops. Check exact brand/variant/size; ask the person about important ambiguity. No online match is allowed: report the gap instead of inventing details.",
  input: z.object({
    name: z.string().trim().min(2).max(120).describe("Public product/brand/size words only; never personal or household data"),
    url: z.url({ protocol: /^https?$/ }).max(1000).optional().describe("Product page supplied by the person or found with the client's own web search"),
    shop: entityRef("shop", "Prefer this existing shop's webshop when searching").optional(),
  }),
  permission: "read", confirm: "never",
  activity: { en: "Prepared product details", nl: "Productgegevens opgezocht" },
  run: async (ctx, input) => {
    const [catalogue, shops] = await Promise.all([listProducts(ctx.householdId), listShops(ctx.householdId)]);
    const describeExisting = (product: Product, matchedBy: "name" | "barcode") => ({
      id: product.id, name: product.name, matchedBy, barcode: product.barcode,
      sharesStockWith: product.stockProductId, imageUrl: product.imageUrl,
      stockUnit: product.unit, packageAmount: product.packageAmount, packageUnit: product.packageUnit,
    });
    const existing = scoreCandidates(input.name, catalogue.filter((product) => compatibleProductType(input.name, product.name))).slice(0, 5).map(({ candidate }) => {
      const product = catalogue.find((product) => product.id === candidate.id)!;
      return describeExisting(product, "name");
    });
    const problems: string[] = [];
    let urls: string[] = input.url ? [input.url] : [];
    const searchAvailable = isWebSearchConfigured();
    if (!input.url && searchAvailable) {
      try {
        const shop = shops.find((shop) => shop.id === input.shop?.id);
        const found = await searchWeb(input.name, { site: siteDomain(shop?.websiteUrl), limit: 3, signal: ctx.signal });
        urls = found.results.slice(0, 2).map((result) => result.url);
        if (found.failedEngines.length) problems.push("Some search engines did not answer; a missing match is not conclusive.");
      } catch { problems.push("Online search was unavailable; try the client's own search and pass a product URL."); }
    }
    if (!input.url && !searchAvailable) problems.push("Server search is unavailable. Use the client's own web search if available, then call again with url; otherwise disclose that online data could not be checked.");
    const pages = await Promise.allSettled(urls.map((url) => readPage(url, { signal: ctx.signal })));
    const online = pages.flatMap((result) => {
      if (result.status === "rejected") { problems.push("A product page could not be read; its metadata was not verified."); return []; }
      const facts = productFacts(result.value);
      if (!facts) return [];
      const shop = shopForUrl(facts.url, shops);
      const offer: Offer | null = shop ? { ...facts, shopId: shop.id, shopName: shop.name } : null;
      return [{
        ...facts, price: money(facts.priceCents), shop: shop ? { id: shop.id, name: shop.name } : null,
        sourceName: result.value.siteName ?? result.value.domain,
        offer: offer ? rememberOffer(ctx.householdId, offer) : null,
      }];
    });
    const barcodeMatches = catalogue.filter((product) => product.barcode && online.some((found) => found.barcode === product.barcode));
    const barcodeIds = new Set(barcodeMatches.map((product) => product.id));
    return {
      untrusted: true, note: UNTRUSTED_NOTE,
      existingProducts: [...barcodeMatches.map((product) => describeExisting(product, "barcode")), ...existing.filter((product) => !barcodeIds.has(product.id))].slice(0, 5),
      lookup: online.length ? "found" : problems.length ? "incomplete" : "not_found",
      attemptedUrls: urls, online, problems,
      next: "Reuse an exact existing product. Inspect related products before creating a distinct variant; link verified shared stock with inventory_link_alternative. For a verified retailer missing from the app, create the shop with shops_save; a manufacturer's page alone is not proof of a retailer. Save verified facts with inventory_save_product (prefer offer), then read back the product. Summarise what was filled, linked and still missing; ask targeted questions when uncertain rather than silently guessing or declaring everything complete.",
    };
  },
});
