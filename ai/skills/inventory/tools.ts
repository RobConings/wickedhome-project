import { getProductContext } from "@/api/catalogue/catalogue.service";
import { z } from "zod";
import { stockPurchaseInputSchema } from "@/features/inventory/types/purchases";
import { purchaseReview, recordStockPurchase } from "@/api/inventory/purchases.service";
import type { StockItem } from "@/features/inventory/types/inventory";
import { PACKAGE_UNITS, PRODUCT_CATEGORIES, formatQuantity, productInputSchema, shoppingStockStatus, type Product } from "@/features/shopping/types/shopping";
import { addDays, todayIn } from "@/types/dates";
import { badRequest, forbidden } from "@/api/lib/http";
import { addMovement, createStockItem, deleteStockItem, getProductStock, listPurchases, listStock, recordPurchases, setStockCount, updateStockItem } from "@/api/inventory/inventory.service";
import { lookupBarcode } from "@/api/shopping/barcode-lookup.service";
import { planStockMerge } from "@/api/shopping/product-alternatives";
import {
  createProduct,
  deleteProduct,
  deleteProductLink,
  findProductByCode,
  getProduct,
  linkAlternative,
  listItems,
  listProducts,
  unlinkAlternative,
  updateProduct,
  upsertProductLink,
} from "@/api/shopping/shopping.service";
import {
  capList,
  day,
  done,
  entityNames,
  entityRef,
  eurosSchema,
  money,
  optionalDateSchema,
  registerAssistantSkill,
  registerAssistantTool,
  registerEntityResolver,
  registerScreenContext,
  say,
  toCents,
  type AssistantPreview,
  type AssistantToolContext,
  type ResolvedEntity,
} from "@ai/core/kit";
import { linkOffer, withOffer } from "../recipes/offer-products";
import { getOffer } from "../recipes/offers";
import { stockPriority } from "../shopping/stock-priority";
import { fold } from "@ai/core/text-match";
import { productSetup } from "./product-setup";
import "./prepare-product";

/** Skill "inventory": household stock and the product catalogue (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "inventory",
  title: { en: "Stock", nl: "Voorraad" },
  summary: "Stock and product setup: proactive photos, shop links, package facts and shared-stock alternatives; Op/near-empty forecasts using minima and essential setting, expiry, use/add and barcodes.",
  keywords: {
    nl: ["voorraad", "voorraadkast", "bijna op", "vervalt", "vervaldatum", "houdbaar", "diepvries", "koelkast", "kelder", "product", "producten", "hebben we nog", "barcode", "streepjescode", "opgebruikt", "minimum", "nog over", "essentieel", "essentiele", "extraatje"],
    en: ["stock", "inventory", "pantry", "running low", "run out", "expire", "expiry", "freezer", "fridge", "product", "do we have", "barcode", "used up", "minimum", "left over", "essential", "nice to have"],
  },
});

const LIST_LIMIT = 30;

const amount = (value: number, unit: string | null, locale: "en" | "nl") => `${formatQuantity(value, locale)}${unit ? ` ${unit}` : ""}`;

const stockRow = (item: StockItem, locale: "en" | "nl", essential: boolean | null = null) => ({
  product: item.productName,
  place: item.placeName,
  qty: amount(item.quantity, item.unit, locale),
  min: item.minQuantity,
  low: item.isLow || null,
  ...stockPriority(shoppingStockStatus([item], item.placeId), essential),
  expires: item.expiresOn,
});

registerEntityResolver({
  type: "product",
  label: "product",
  skill: "inventory",
  list: async (ctx) =>
    (await listProducts(ctx.householdId)).map((product) => ({
      id: product.id,
      name: product.name,
      aliases: product.barcode ? [product.barcode] : [],
      hint: product.category,
    })),
});

/** The stock item a product + optional place means: the only one, or the one at that place; otherwise a question. */
export function pickStockItem<T extends Pick<StockItem, "placeId" | "placeName">>(items: T[], productName: string, place?: { id: string; name: string }): T | string {
  const candidates = place ? items.filter((item) => item.placeId === place.id) : items;
  if (candidates.length === 1 && candidates[0]) return candidates[0];
  if (!items.length) return `${productName} isn't kept in stock anywhere yet (an adult can add it with inventory_save_stock_item).`;
  const places = items.map((item) => item.placeName).join(" or ");
  return place ? `${productName} isn't kept in ${place.name}; it is kept in ${places}.` : `Where: ${places}? Give the place.`;
}

/** listStock resolves an alternative to its main product, so this is the stock the product shares. */
async function stockItemOf(ctx: AssistantToolContext, product: ResolvedEntity, place?: ResolvedEntity) {
  const picked = pickStockItem(await listStock(ctx.householdId, { productId: product.id }), product.name, place);
  if (typeof picked === "string") throw badRequest(picked);
  return picked;
}

const CHILD_STOCK_RULE = "Only adults set a stock count or change stock settings (minimum, place); children can only use up or add stock.";
const noChildren = (ctx: AssistantToolContext) => {
  if (ctx.user.role === "child") throw forbidden(CHILD_STOCK_RULE);
};

// ── Reads ─────────────────────────────────────────────────────────────────────────────────────────────

registerAssistantTool({
  name: "inventory.low_stock",
  description: "Stock at or below minimum and expiring soon. Returns stockStatus, stockNeed (out = below minimum OR essential at minimum; nearly_out = nonessential at minimum), buyingAdvice (out = to_buy, nearly_out = warning), essential and importance, place and shopping-list presence. All at-or-below stock auto-lists regardless of importance; the person decides what to buy.",
  input: z.object({
    expiringWithinDays: z.number().int().min(0).max(60).default(7).describe("Also list items expiring within this many days"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the stock", nl: "Voorraad bekeken" },
  run: async (ctx, input) => {
    const [stock, open, products] = await Promise.all([
      listStock(ctx.householdId),
      listItems(ctx.householdId, { status: "open" }, ctx.locale),
      listProducts(ctx.householdId),
    ]);
    // Stock belongs to a group's main product; an item for any of its alternatives counts as on the list.
    const ownerOf = new Map(products.map((product) => [product.id, product.stockProductId ?? product.id]));
    const essentialById = new Map(products.map((product) => [product.id, product.isEssential]));
    const onList = new Set(open.flatMap((item) => (item.productId ? [ownerOf.get(item.productId) ?? item.productId] : [])));
    const until = addDays(todayIn(), input.expiringWithinDays);
    const expiring = stock
      .filter((item) => item.expiresOn && item.expiresOn <= until && item.quantity > 0)
      .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
    return {
      low: capList(
        stock.filter((item) => item.isLow),
        LIST_LIMIT,
        (item) => ({ ...stockRow(item, ctx.locale, essentialById.get(item.productId) ?? null), low: null, onShoppingList: onList.has(item.productId) }),
      ),
      expiringSoon: capList(expiring, LIST_LIMIT, (item) => stockRow(item, ctx.locale, essentialById.get(item.productId) ?? null)),
    };
  },
});

registerAssistantTool({
  name: "inventory.stock",
  description: "Stock per product/place: quantity, minimum, expiry, stockStatus, stockNeed (out = below minimum OR essential at minimum; nearly_out = nonessential at minimum) and buyingAdvice (out = to_buy; nearly_out = warning). Give a product for shared stock and recent changes. Importance never excludes a product from groceries; the person chooses what to buy.",
  input: z.object({
    product: entityRef("product").optional(),
    place: entityRef("place", "Only what is kept in this room").optional(),
    q: z.string().trim().max(80).optional().describe("Part of a product name"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the stock", nl: "Voorraad bekeken" },
  run: async (ctx, input) => {
    if (input.product) {
      const [stock, product] = await Promise.all([getProductStock(ctx.householdId, input.product.id), getProduct(ctx.householdId, input.product.id)]);
      const items = stock.stockItems.filter((item) => !input.place || item.placeId === input.place.id);
      return {
        product: input.product.name,
        ...stockPriority(null, product.isEssential),
        stock: items.length ? items.map((item) => stockRow(item, ctx.locale, product.isEssential)) : "not kept in stock",
        recent: stock.movements.slice(0, 8).map(
          (move) => `${day(move.createdAt)} ${move.delta > 0 ? "+" : ""}${formatQuantity(move.delta, ctx.locale)} ${move.placeName} (${move.reason.replace("scan_", "")})${move.userName ? ` ${move.userName}` : ""}`,
        ),
        movementSources: stock.movements.slice(0, 8).map((move) => ({ id: move.id,
          purchase: move.purchase ? { ...move.purchase, url: `/purchases/${move.purchase.kind === "acquisition" ? "acquisitions/" : ""}${encodeURIComponent(move.purchase.id)}` } : null,
          need: move.needId ? { id: move.needId, url: `/shopping/items/${encodeURIComponent(move.needId)}` } : null,
          cooking: move.cookingEntryId ? { id: move.cookingEntryId, url: `/recipes/cook/${encodeURIComponent(move.cookingEntryId)}` } : null,
        })),
      };
    }
    const query = input.q?.toLowerCase();
    const [rows, products] = await Promise.all([listStock(ctx.householdId, { placeId: input.place?.id }), listProducts(ctx.householdId)]);
    const stock = rows.filter((item) => !query || item.productName.toLowerCase().includes(query));
    const essentialById = new Map(products.map((product) => [product.id, product.isEssential]));
    return { count: stock.length, ...capList(stock, LIST_LIMIT, (item) => stockRow(item, ctx.locale, essentialById.get(item.productId) ?? null)) };
  },
});

registerAssistantTool({
  name: "inventory.purchase_history",
  description: "Recent items added to household stock as purchases, with quantity, unit, place, date, note and who recorded them. This is purchase movement history, not expenses or prices.",
  input: z.object({
    withinDays: z.number().int().min(1).max(365).default(30).describe("How far back to look"),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked purchase history", nl: "Aankopen bekeken" },
  run: async (ctx, input) => ({
    purchases: await listPurchases(ctx.householdId, {
      since: new Date(Date.now() - input.withinDays * 24 * 60 * 60 * 1000),
      limit: input.limit,
    }),
  }),
});

const linkText = (product: Product) =>
  product.shopLinks.length
    ? product.shopLinks.map((link) => [link.shop.name, money(link.priceCents), link.url ? "webshop link" : null].filter(Boolean).join(" "))
    : null;

registerAssistantTool({
  name: "inventory.products",
  description: "Search the existing product catalogue before groceries or creating products; try relevant names and alternatives. Returns ids, shared-stock relationships, package sizes and importance; give product for stock and actual webshop links. Check inventory_stock and shopping_list, then pass product to shopping_add_item (or shopping_update_item to repair an existing item). Paginated: follow nextOffset with the same q/limit until hasMore is false. Barcode identifies a product.",
  input: z.object({
    product: entityRef("product", "One product's details").optional(),
    q: z.string().trim().max(80).optional().describe("Part of a product name"),
    barcode: z.string().trim().regex(/^\d{6,14}$/).optional(),
    offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0).describe("List only: products to skip; use the previous nextOffset"),
    limit: z.number().int().min(1).max(100).default(LIST_LIMIT).describe("List only: products per page (up to 100)"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the products", nl: "Producten bekeken" },
  run: async (ctx, input) => {
    const shopNames = await entityNames(ctx, "shop");
    const detail = (product: Product, stock?: StockItem[]) => ({
      id: product.id,
      name: product.name,
      brand: product.brand ?? null,
      imageUrl: product.imageUrl,
      unit: product.unit,
      packageAmount: product.packageAmount,
      packageUnit: product.packageUnit,
      sharesStockWith: product.stockProductId,
      alternatives: product.alternatives.map(({ id, name }) => ({ id, name })),
      category: product.category,
      ...stockPriority(null, product.isEssential),
      defaultShop: product.defaultShopId ? (shopNames.get(product.defaultShopId) ?? null) : null,
      barcode: product.barcode,
      notes: product.notes,
      shops: linkText(product),
      links: product.shopLinks.map((link) => ({ shop: link.shop.name, url: link.url, price: money(link.priceCents) })),
      stock: stock?.length ? stock.map((item) => `${item.placeName} ${amount(item.quantity, item.unit, ctx.locale)}`) : null,
      setup: productSetup(product),
    });
    if (input.barcode) {
      const known = await findProductByCode(ctx.householdId, input.barcode);
      if (known) return { inCatalogue: true, ...detail(known, await listStock(ctx.householdId, { productId: known.id })) };
      // Looked up in public product data; the result never says where it comes from.
      const lookup = await lookupBarcode(ctx.householdId, input.barcode, ctx.user.locale);
      if (lookup.status !== "found" || !lookup.suggestion) {
        return { inCatalogue: false, found: false, note: lookup.status === "unavailable" ? "The lookup is not available right now; try again later." : "Unknown barcode." };
      }
      const suggestion = lookup.suggestion;
      return { inCatalogue: false, found: true, suggestion: { name: suggestion.productName, brand: suggestion.brand, quantity: suggestion.quantity?.text ?? null, category: suggestion.category } };
    }
    if (input.product) {
      const [product, stock] = await Promise.all([getProduct(ctx.householdId, input.product.id), listStock(ctx.householdId, { productId: input.product.id })]);
      return detail(product, stock);
    }
    const products = await listProducts(ctx.householdId, { q: input.q });
    const page = capList(products.slice(input.offset), input.limit, (product) => ({
      id: product.id, name: product.name, brand: product.brand ?? null, category: product.category, ...stockPriority(null, product.isEssential),
      unit: product.unit, packageAmount: product.packageAmount, packageUnit: product.packageUnit,
      sharesStockWith: product.stockProductId, alternatives: product.alternatives.map(({ id, name }) => ({ id, name })),
      shops: linkText(product),
    }));
    const hasMore = (page.more ?? 0) > 0;
    return {
      count: products.length,
      ...page,
      offset: input.offset,
      limit: input.limit,
      hasMore,
      ...(hasMore && { nextOffset: input.offset + page.items.length }),
    };
  },
});

// ── Writes ────────────────────────────────────────────────────────────────────────────────────────────

const purchaseInput = z.object({
  items: z.array(z.object({
    product: z.string().trim().min(1).max(120).describe("The household product name; use the existing catalogue name when available"),
    quantity: z.coerce.number().positive().max(100_000).describe("How many household stock units were bought, not the receipt weight unless this product is normally tracked by weight"),
    unit: z.string().trim().min(1).max(20).optional().describe("Household stock unit, not automatically the receipt unit. Prefer the existing product's unit; omit for its existing/default count unit. Use weight/volume only when that product is normally tracked that way."),
    place: entityRef("place", "Where this product is stored; omit only when it has exactly one known stock location").optional(),
    category: z.enum(PRODUCT_CATEGORIES).optional().describe("Used only when a new catalogue product must be created"),
  })).min(1).max(50),
  receiptImageIndex: z.number().int().min(0).optional().describe("Optional zero-based image index when this purchase should be linked to one of several images attached to this message"),
  note: z.string().trim().max(200).optional().describe("Optional receipt or shop note"),
});

registerAssistantTool({
  name: "inventory.record_purchase_batch",
  description: "For goods in a shopping visit use shopping_session_match_receipt to preserve visit links. Record a batch of newly reported purchases in household stock, with or without a receipt image. First check inventory_products for existing catalogue names and stock units; map abbreviated receipt labels to those names instead of creating duplicates. receiptImageIndex selects among attached images. Without a receipt, these are ordinary manually reported purchases, not receipt imports. Use household units (e.g. bunches, packs, bottles), not unverified receipt weight. Ask about unclear counts or storage places. Creates missing catalogue products and stock entries; does not record expenses or prices. Uses the shared purchase ledger: if prior acquisitions need review, use inventory_purchases and inventory_record_purchase to reconcile them instead of retrying this batch. For dated receipt evidence, use inventory_record_purchase with its uploaded document and actual purchase date.",
  input: purchaseInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Recorded purchases in stock", nl: "Aankopen in de voorraad geboekt" },
  refuse: (ctx, input) => {
    const images = ctx.receiptImageIds ?? [];
    if (input.receiptImageIndex !== undefined && input.receiptImageIndex >= images.length) return "That receiptImageIndex does not match an image attached to this message.";
    return null;
  },
  describe: (ctx, input) => {
    const lines = input.items.map((item) =>
      `${formatQuantity(item.quantity, ctx.locale)}${item.unit ? ` ${item.unit}` : ""} ${item.product}${item.place ? ` (${item.place.name})` : ""}`,
    );
    const source = input.receiptImageIndex !== undefined || (ctx.receiptImageIds?.length === 1)
      ? say(ctx.locale, "purchases from the attached receipt", "aankopen van de bijgevoegde bon")
      : say(ctx.locale, "reported purchases", "gemelde aankopen");
    return say(ctx.locale, `Record ${source} in stock: ${lines.join("; ")}`, `${source} in de voorraad boeken: ${lines.join("; ")}`);
  },
  run: async (ctx, input) => {
    const images = ctx.receiptImageIds ?? [];
    const receiptImageId = input.receiptImageIndex !== undefined
      ? images[input.receiptImageIndex]
      : images.length === 1 ? images[0] : undefined;
    if (input.receiptImageIndex !== undefined && !receiptImageId) throw badRequest("That receipt image is no longer available. Attach it again and retry.");
    const products = await listProducts(ctx.householdId);
    const stockByProduct = new Map<string, StockItem[]>();
    const lines = [];
    for (const item of input.items) {
      const key = item.product.toLocaleLowerCase().replace(/\s+/g, " ");
      const matches = products.filter((product) => product.name.toLocaleLowerCase().replace(/\s+/g, " ") === key);
      if (matches.length > 1) throw badRequest(`More than one product is named "${item.product}"; choose or rename the matching catalogue product first.`);
      const product = matches[0];
      let place = item.place;
      if (!place && product) {
        let stock = stockByProduct.get(product.id);
        if (!stock) {
          stock = await listStock(ctx.householdId, { productId: product.id });
          stockByProduct.set(product.id, stock);
        }
        if (stock.length === 1) {
          const onlyPlace = stock[0]!;
          place = { type: "place", id: onlyPlace.placeId, name: onlyPlace.placeName };
        } else {
          throw badRequest(stock.length
            ? `Where should ${item.product} be stored? It is kept in ${stock.map((entry) => entry.placeName).join(" or ")}.`
            : `Where should ${item.product} be stored? Give its place.`);
        }
      }
      if (!place) throw badRequest(`Where should the new product ${item.product} be stored? Give its place.`);
      lines.push({
        product: item.product,
        quantity: item.quantity,
        unit: item.unit,
        placeId: place.id,
        category: item.category,
      });
    }
    const stock = await recordPurchases(ctx.user, lines, receiptImageId, input.note);
    return done(
      stock.map((item) => `${item.productName} in ${item.placeName}: ${amount(item.quantity, item.unit, ctx.locale)} now`).join("; "),
      { recorded: input.items.length, receiptAttached: Boolean(receiptImageId), stock },
    );
  },
});

registerAssistantTool({
  name: "inventory.change_stock",
  description: "Use up or add stock of a product, or set its counted quantity (adults only). At or below minimum it goes on groceries: below = Op/to_buy; essential at minimum = Op/to_buy; nonessential at minimum = Bijna op/warning. These are forecasts, not necessarily zero stock. Not for changing the minimum.",
  input: z.object({
    product: entityRef("product"),
    place: entityRef("place", "Where it is kept, when it is kept in several places").optional(),
    action: z.enum(["use", "add", "set"]).describe("set = the quantity that is there now (a count)"),
    amount: z.number().min(0).max(100_000),
    note: z.string().trim().max(200).optional(),
    purchase: stockPurchaseInputSchema.omit({ quantity: true }).optional().describe("Required for add: identify scan/manual operation or uploaded receipt line; link an existing purchase instead of adding it twice. Ask before separatePurchaseConfirmed or countDisposition."),
  }),
  permission: "write",
  confirm: "first-time",
  // Using and adding stock is for everyone (children scan too); setting a count is for adults, as in the app.
  roles: ["owner", "adult", "child"],
  refuse: (ctx, input) => (input.action === "set" && ctx.user.role === "child" ? CHILD_STOCK_RULE : null),
  activity: { en: "Updated the stock", nl: "Voorraad bijgewerkt" },
  describe: (ctx, input) => {
    const what = `${formatQuantity(input.amount, ctx.locale)} ${input.product.name}${input.place ? ` (${input.place.name})` : ""}`;
    if (input.action === "use") return say(ctx.locale, `Take ${what} out of the stock`, `${what} uit de voorraad halen`);
    if (input.action === "add") return say(ctx.locale, `Add ${what} to the stock`, `${what} aan de voorraad toevoegen`);
    return say(ctx.locale, `Set the stock of ${input.product.name} to ${formatQuantity(input.amount, ctx.locale)}`, `Voorraad van ${input.product.name} op ${formatQuantity(input.amount, ctx.locale)} zetten`);
  },
  run: async (ctx, input) => {
    if (input.action === "set") noChildren(ctx);
    const item = await stockItemOf(ctx, input.product, input.place);
    if (input.action !== "set" && input.amount <= 0) throw badRequest("Give an amount above 0");
    const delta = input.action === "use" ? -input.amount : input.action === "add" ? input.amount : input.amount - item.quantity;
    if (delta === 0 && input.action !== "set") return done(`${item.productName} in ${item.placeName} is already ${amount(item.quantity, item.unit, ctx.locale)}.`);
    const reason = input.action === "use" ? "scan_use" : input.action === "add" ? "scan_add" : "manual_correction";
    const result = input.action === "set"
      ? await setStockCount(ctx.user, item.id, { quantity: input.amount, expectedUpdatedAt: item.updatedAt, note: input.note })
      : input.action === "add"
        ? await recordStockPurchase(ctx.user, item.id, { ...(() => { if (!input.purchase) throw badRequest("For additions, use inventory_record_purchase with a stable source. Check existing purchases first; never add a receipt again after a shopping tick or scan."); return input.purchase; })(), quantity: input.amount, note: input.note })
        : await addMovement(ctx.user, item.id, { delta, reason, note: input.note ?? null });
    const left = amount(result.stockItem.quantity, result.stockItem.unit, ctx.locale);
    const low = result.addedToShoppingList ? " Running low: it is on the shopping list now." : result.stockItem.isLow ? " Running low." : "";
    return done(`${result.stockItem.productName} in ${result.stockItem.placeName}: ${left} now.${low}`, { stock: result.stockItem, purchase: result.purchase });
  },
});

registerAssistantTool({
  name: "inventory.purchases",
  description: "Before recording scans or receipt lines, inspect recent acquisitions and the last physical count. Purchase ids identify already recorded goods; a barcode identifies a product, not an acquisition. Link a receipt to one or more matching acquisitions, or ask whether it is extra. Dates/shops alone do not prove identity.",
  input: z.object({ product: entityRef("product"), place: entityRef("place").optional() }),
  permission: "read", confirm: "never", roles: ["owner", "adult", "child"],
  activity: { en: "Checked purchases", nl: "Aankopen bekeken" },
  run: async (ctx, input) => {
    const item = await stockItemOf(ctx, input.product, input.place);
    const review = await purchaseReview(ctx.householdId, item.id);
    return done(`${item.productName}: ${review.purchases.length} recent acquisitions.`, { stockItemId: item.id, product: item.productName, place: item.placeName, ...review });
  },
});

registerAssistantTool({
  name: "inventory.record_purchase",
  description: "For a shopping visit use shopping_session_match_receipt to preserve visit links. Record actual purchased goods once, or attach later scan/receipt evidence to existingPurchaseIds without adding stock. quantity is in the stock location's unit, NOT an unverified receipt weight. Use the uploaded document and its printed line number for receipts, actual purchasedAt date and shop. Reuse source.reference on retries. The server rejects ambiguous additions and receipts older than a physical count until the person confirms same/extra or already counted. Never set separatePurchaseConfirmed/countDisposition on your own. Independent purchases at two shops get separate acquisitions; identical receipt uploads are detected by content hash. A linked receipt quantity must equal the sum of its purchases; report discrepancies for correction instead of guessing.",
  input: stockPurchaseInputSchema.extend({ product: entityRef("product"), place: entityRef("place").optional() }),
  permission: "write", confirm: "first-time", roles: ["owner", "adult", "child"],
  activity: { en: "Checked purchased stock", nl: "Gekochte voorraad gecontroleerd" },
  describe: (ctx, input) => say(ctx.locale, `Check ${input.quantity} ${input.product.name} in stock`, `${input.quantity} ${input.product.name} in de voorraad controleren`),
  run: async (ctx, input) => {
    const item = await stockItemOf(ctx, input.product, input.place);
    const result = await recordStockPurchase(ctx.user, item.id, input);
    return done(say(ctx.locale, `${result.purchase?.added ?? 0} added; ${result.stockItem.quantity} now in ${result.stockItem.placeName}.`, `${result.purchase?.added ?? 0} bijgeteld; nu ${result.stockItem.quantity} in ${result.stockItem.placeName}.`), { stock: result.stockItem, purchase: result.purchase, linkedWithoutAddingStock: result.purchase?.added === 0 });
  },
});

registerAssistantTool({
  name: "inventory.save_stock_item",
  description: "Keep a product in stock at a place, or change its minimum (below it: on the shopping list), unit or expiry date there.",
  input: z.object({
    product: entityRef("product"),
    place: entityRef("place", "Where it is kept, e.g. 'kelder'"),
    quantity: z.number().min(0).max(100_000).optional().describe("New stock item: what is there now"),
    minimum: z.number().min(0).max(100_000).optional(),
    noMinimum: z.boolean().optional(),
    unit: z.string().trim().max(20).optional(),
    expiresOn: optionalDateSchema("Expiry date YYYY-MM-DD"),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Saved stock settings", nl: "Voorraadinstellingen bewaard" },
  describe: (ctx, input) => {
    const parts = [
      input.quantity !== undefined && say(ctx.locale, `${formatQuantity(input.quantity, "en")} there`, `${formatQuantity(input.quantity, "nl")} aanwezig`),
      input.minimum !== undefined && say(ctx.locale, `minimum ${input.minimum}`, `minimum ${input.minimum}`),
      input.noMinimum && say(ctx.locale, "no minimum", "geen minimum"),
      input.expiresOn && say(ctx.locale, `expires ${day(input.expiresOn, "en")}`, `vervalt ${day(input.expiresOn, "nl")}`),
    ].filter(Boolean);
    return say(ctx.locale, `Stock of ${input.product.name} in ${input.place.name}: ${parts.join(", ")}`, `Voorraad ${input.product.name} in ${input.place.name}: ${parts.join(", ")}`);
  },
  run: async (ctx, input) => {
    const existing = (await listStock(ctx.householdId, { productId: input.product.id })).find((item) => item.placeId === input.place.id);
    const minQuantity = input.noMinimum ? null : (input.minimum ?? existing?.minQuantity ?? null);
    if (!existing) {
      const item = await createStockItem(ctx.user, {
        productId: input.product.id,
        placeId: input.place.id,
        quantity: input.quantity ?? 0,
        unit: input.unit ?? null,
        minQuantity,
        expiresOn: input.expiresOn ?? null,
      });
      return done(`${item.productName} is now kept in ${item.placeName} (${amount(item.quantity, item.unit, ctx.locale)}).`, { id: item.id });
    }
    const result = await updateStockItem(ctx.user, existing.id, {
      quantity: input.quantity ?? existing.quantity,
      unit: input.unit ?? existing.unit,
      minQuantity,
      expiresOn: input.expiresOn ?? existing.expiresOn,
    });
    const item = result.stockItem;
    return done(`Saved ${item.productName} in ${item.placeName}: ${amount(item.quantity, item.unit, ctx.locale)}${item.minQuantity !== null ? `, minimum ${item.minQuantity}` : ""}.`, { id: item.id });
  },
});

const saveProductInput = z.object({
  product: entityRef("product", "The product to change; leave out to add one").optional(),
  offer: z.string().trim().max(20).optional().describe("The offer from inventory_prepare_product or recipes_find_product: copies its verified shop link, price, photo, barcode and package size"),
  imageUrl: productInputSchema.shape.imageUrl.describe("Verified product photo URL from inventory_prepare_product, web_read or the person. Omitted preserves it; null explicitly removes it"),
  name: z.string().trim().min(1).max(120).optional().describe("Required for a new product (default: the offer's name)"),
  brand: productInputSchema.shape.brand.describe("Recorded product brand; omit to preserve the existing brand, null to clear it. Do not infer a brand from the name"),
  unit: z.string().trim().max(20).optional().describe("How stock is counted, e.g. 'pak', 'st.'"),
  packageAmount: z.number().positive().max(1_000_000).optional().describe("Content of one package, e.g. 200 (with packageUnit 'g'); a 6 x 33 cl pack is 198 cl"),
  packageUnit: z.enum(PACKAGE_UNITS).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  isEssential: z.boolean().optional().describe("Essential at minimum is Op/out; nonessential at minimum is Bijna op/nearly_out. Below minimum both are Op/out. Omitted keeps the setting"),
  defaultShop: entityRef("shop").optional(),
  barcode: z.string().trim().regex(/^\d{6,14}$/).optional(),
  notes: z.string().trim().max(1000).optional(),
  linkShop: entityRef("shop", "Shop of the link to set or remove").optional(),
  linkUrl: z.url({ protocol: /^https?$/ }).max(1000).optional().describe("The product page on that shop's webshop"),
  linkPrice: eurosSchema.optional(),
  removeLink: z.boolean().optional().describe("Remove the link at linkShop"),
});
type SaveProductArgs = z.output<typeof saveProductInput>;

/** The offer a save refers to; an unknown or expired one is refused (search again) rather than silently dropped. */
function offerOf(ctx: { householdId: string }, input: SaveProductArgs) {
  if (!input.offer) return null;
  const offer = getOffer(ctx.householdId, input.offer);
  if (!offer) throw badRequest(`Offer ${input.offer} is unknown or expired: run inventory_prepare_product again (or recipes_find_product for ingredients) and use its offer.`);
  return offer;
}

registerAssistantTool({
  name: "inventory.save_product",
  description:
    "Create or enrich a product. First inventory_prepare_product: reuse existing products, inspect relevant alternatives, proactively find photo, product link, shop, package size, barcode and price where available. Pass offer to copy verified online facts; or imageUrl/linkShop/linkUrl/defaultShop directly. Create missing retailers with shops_save; link confirmed alternatives with inventory_link_alternative. Ask about important ambiguity, not permission for routine research. Missing online data is allowed and must be disclosed. Returns stored setup gaps; re-read and confirm filled/linked/missing details to the person.",
  input: saveProductInput,
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a product", nl: "Product bewaard" },
  describe: (ctx, input) => {
    const offer = input.offer ? getOffer(ctx.householdId, input.offer) : null;
    const name = input.product?.name ?? input.name ?? offer?.name ?? "?";
    const link = input.linkShop
      ? input.removeLink
        ? say(ctx.locale, ` (remove the ${input.linkShop.name} link)`, ` (link bij ${input.linkShop.name} weg)`)
        : say(ctx.locale, ` (link at ${input.linkShop.name}${input.linkPrice ? ` ${money(toCents(input.linkPrice))}` : ""})`, ` (link bij ${input.linkShop.name}${input.linkPrice ? ` ${money(toCents(input.linkPrice))}` : ""})`)
      : offer
        ? say(ctx.locale, ` (link at ${offer.shopName}${offer.priceCents !== null ? ` ${money(offer.priceCents)}` : ""})`, ` (link bij ${offer.shopName}${offer.priceCents !== null ? ` ${money(offer.priceCents)}` : ""})`)
        : "";
    const essential = input.isEssential === undefined ? "" : say(ctx.locale,
      input.isEssential ? " (essential)" : " (nice to have)",
      input.isEssential ? " (essentieel)" : " (extraatje)");
    const details = [
      input.imageUrl === null ? say(ctx.locale, "remove photo", "foto verwijderen") : input.imageUrl || offer?.imageUrl ? say(ctx.locale, "product photo", "productfoto") : null,
      input.defaultShop?.name ?? (!input.removeLink ? input.linkShop?.name : null) ?? offer?.shopName,
      input.packageAmount && input.packageUnit ? `${input.packageAmount} ${input.packageUnit}` : offer?.packageAmount ? `${offer.packageAmount} ${offer.packageUnit}` : null,
      input.category,
      input.unit && say(ctx.locale, `stock unit ${input.unit}`, `voorraadeenheid ${input.unit}`),
      input.name && input.product && input.name !== input.product.name ? say(ctx.locale, `rename to ${input.name}`, `hernoemen naar ${input.name}`) : null,
      input.barcode && say(ctx.locale, `barcode ${input.barcode}`, `barcode ${input.barcode}`),
    ].filter(Boolean);
    const extra = details.length ? ` (${details.join(", ")})` : "";
    return input.product
      ? say(ctx.locale, `Change the product ${name}${link}${essential}${extra}`, `Product ${name} aanpassen${link}${essential}${extra}`)
      : say(ctx.locale, `Add the product ${name}${link}${essential}${extra}`, `Product ${name} toevoegen${link}${essential}${extra}`);
  },
  // The card shows the webshop link and price (and the photo and package size) that will be stored.
  preview: (ctx, input): AssistantPreview | null => {
    const offer = input.offer ? getOffer(ctx.householdId, input.offer) : null;
    const url = input.linkUrl ?? offer?.url;
    const price = input.linkPrice !== undefined ? toCents(input.linkPrice) : (offer?.priceCents ?? null);
    const shop = input.linkShop?.name ?? offer?.shopName;
    const image = input.imageUrl !== undefined ? input.imageUrl : offer?.imageUrl;
    const size = input.packageAmount && input.packageUnit ? `${input.packageAmount} ${input.packageUnit}` : offer?.packageAmount ? `${offer.packageAmount} ${offer.packageUnit}` : null;
    const items = [
      url && shop && { label: say(ctx.locale, `Webshop (${shop})`, `Webshop (${shop})`), detail: [price !== null ? money(price) : null, url].filter(Boolean).join(" · "), tone: "add" as const },
      image && { label: say(ctx.locale, "Photo", "Foto"), detail: image, tone: "add" as const },
      input.imageUrl === null && { label: say(ctx.locale, "Photo", "Foto"), detail: say(ctx.locale, "Remove the stored photo", "Opgeslagen foto verwijderen"), tone: "remove" as const },
      size && { label: say(ctx.locale, "Content per package", "Inhoud per verpakking"), detail: size, tone: "add" as const },
    ].filter((item): item is { label: string; detail: string; tone: "add" | "remove" } => Boolean(item));
    return items.length ? { kind: "list", title: input.offer || input.product ? say(ctx.locale, "Stored with the product", "Bewaard bij het product") : say(ctx.locale, "Product", "Product"), data: { items } } : null;
  },
  run: async (ctx, input) => {
    const offer = offerOf(ctx, input);
    const current = input.product ? await getProduct(ctx.householdId, input.product.id) : null;
    if ((input.linkUrl !== undefined || input.linkPrice !== undefined || input.removeLink) && !input.linkShop) throw badRequest("Give linkShop with linkUrl, linkPrice or removeLink, or pass the verified offer alone. No product was changed.");
    if (!current) {
      const name = input.name ?? offer?.name;
      const barcode = input.barcode ?? offer?.barcode;
      const duplicate = (await listProducts(ctx.householdId)).find((product) => (name && fold(product.name) === fold(name)) || (barcode && product.barcode === barcode));
      if (duplicate) throw badRequest(`Product "${duplicate.name}" already exists (id: ${duplicate.id}). Reuse it or call inventory_save_product with product to enrich it, instead of creating a duplicate.`);
    }
    const changesProduct =
      !current ||
      Boolean(offer) ||
      ["name", "brand", "unit", "packageAmount", "packageUnit", "category", "isEssential", "defaultShop", "barcode", "notes", "imageUrl", "linkShop"].some((key) => input[key as keyof typeof input] !== undefined);
    let product = current;
    if (changesProduct) {
      const base = productInputSchema.parse({
        name: input.name ?? current?.name ?? offer?.name,
        brand: input.brand !== undefined ? input.brand : current?.brand ?? null,
        unit: input.unit ?? current?.unit ?? null,
        // Kept unless given: a change of another field never drops the content per package.
        packageAmount: input.packageAmount ?? (input.packageUnit ? null : current?.packageAmount) ?? null,
        packageUnit: input.packageUnit ?? (input.packageAmount ? null : current?.packageUnit) ?? null,
        category: input.category ?? current?.category ?? "other",
        isEssential: input.isEssential ?? current?.isEssential ?? false,
        defaultShopId: input.defaultShop?.id ?? current?.defaultShopId ?? (!input.removeLink ? input.linkShop?.id : null) ?? null,
        barcode: input.barcode ?? current?.barcode ?? null,
        qrCode: current?.qrCode ?? null,
        imageUrl: input.imageUrl !== undefined ? input.imageUrl : current?.imageUrl ?? null,
        notes: input.notes ?? current?.notes ?? null,
      });
      const data = offer ? withOffer(base, offer) : base;
      if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
      product = current ? await updateProduct(ctx.householdId, current.id, data) : await createProduct(ctx.householdId, data);
    }
    if (!product) throw badRequest("Which product?");
    if (input.linkShop) {
      if (input.removeLink) await deleteProductLink(ctx.householdId, product.id, input.linkShop.id);
      else {
        const existing = product.shopLinks.find((link) => link.shopId === input.linkShop?.id);
        await upsertProductLink(ctx.householdId, product.id, {
          shopId: input.linkShop.id,
          url: input.linkUrl ?? (offer?.shopId === input.linkShop.id ? offer.url : undefined) ?? existing?.url ?? null,
          priceCents: input.linkPrice !== undefined ? toCents(input.linkPrice) : offer?.shopId === input.linkShop.id ? offer.priceCents : (existing?.priceCents ?? null),
          articleNumber: existing?.articleNumber ?? null,
        });
      }
    }
    if (offer && input.linkShop?.id !== offer.shopId) product = await linkOffer(ctx.householdId, product.id, offer);
    const saved = await getProduct(ctx.householdId, product.id).catch(() => null);
    if (!saved) return done(`Saved the product ${product.name}, but the final read-back failed. Do not create it again: use inventory_products with this id to verify the stored setup before confirming completion.`, { id: product.id, verification: "pending" });
    return done(`${current ? "Saved" : "Added"} the product ${saved.name}. Stored fields checked; summarise the setup and disclose any unresolved gaps.`, {
      id: saved.id, name: saved.name, brand: saved.brand ?? null, imageUrl: saved.imageUrl, defaultShopId: saved.defaultShopId,
      links: saved.shopLinks.map((link) => ({ shop: link.shop.name, url: link.url, price: money(link.priceCents) })),
      verification: "stored_fields_checked", setup: productSetup(saved), ...stockPriority(null, saved.isEssential),
    });
  },
});

registerAssistantTool({
  name: "inventory.link_alternative",
  description:
    "Link separate catalogue products to one shared package-count stock. If either is already linked, their ENTIRE existing groups will be linked too (not just the chosen variant). Each product keeps its own name and package size; one pack still counts as one pack. Check inventory_products and preview all affected products. For a grouped link explicitly ask the person to confirm and set confirmGroupMerge true only after they agree; otherwise the server refuses. sharedName may create a generic main product. Unlink only on request. Never create products to work around a link error.",
  input: z.object({
    product: entityRef("product", "The alternative, e.g. the brand that was bought"),
    sharesWith: entityRef("product", "The product whose stock it shares").optional(),
    sharedName: z.string().trim().min(1).max(120).optional().describe("Name for the shared stock: a new generic product"),
    confirmGroupMerge: z.boolean().optional().describe("Only true after the person explicitly agrees to link ALL existing alternatives in BOTH groups."),
    unlink: z.boolean().optional().describe("Take the product out of its group instead"),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Linked products", nl: "Producten gekoppeld" },
  describe: (ctx, input) => {
    const name = input.product.name;
    if (input.unlink) return say(ctx.locale, `${name} no longer shares stock`, `${name} deelt geen voorraad meer`);
    const other = input.sharedName ?? input.sharesWith?.name ?? "?";
    return say(ctx.locale, `${name} shares stock with ${other}`, `${name} deelt voorraad met ${other}`);
  },
  preview: async (ctx, input) => {
    if (input.unlink || !input.sharesWith) return null;
    const [product, chosen] = await Promise.all([
      getProduct(ctx.householdId, input.product.id),
      getProduct(ctx.householdId, input.sharesWith.id),
    ]);
    const [source, target] = await Promise.all([
      product.stockProductId ? getProduct(ctx.householdId, product.stockProductId) : product,
      chosen.stockProductId ? getProduct(ctx.householdId, chosen.stockProductId) : chosen,
    ]);
    if (source.id === target.id) return null;
    const sourceNames = [source.name, ...source.alternatives.map((item) => item.name)];
    const targetNames = [target.name, ...target.alternatives.map((item) => item.name)];
    const mergingGroups = sourceNames.length > 1 || targetNames.length > 1;
    const [mine, theirs] = await Promise.all([
      listStock(ctx.householdId, { productId: source.id }),
      listStock(ctx.householdId, { productId: target.id }),
    ]);
    const rows = new Map(theirs.map((item) => [item.placeId, { label: item.placeName, detail: amount(item.quantity, item.unit, ctx.locale), tone: undefined as "add" | "change" | undefined }]));
    for (const step of planStockMerge(mine, theirs)) {
      const item = mine.find((candidate) => candidate.id === step.sourceId);
      if (!item) continue;
      rows.set(step.placeId, { label: item.placeName, detail: amount(step.quantity, item.unit, ctx.locale), tone: step.kind === "move" ? "add" : "change" });
    }
    const items: { label: string; detail: string; tone?: "add" | "change" }[] = mergingGroups ? [
      { label: say(ctx.locale, "Current linked group", "Bestaande gekoppelde groep"), detail: targetNames.join(", "), tone: undefined },
      { label: say(ctx.locale, "Additional linked group", "Mee te koppelen groep"), detail: sourceNames.join(", "), tone: undefined },
    ] : [];
    items.push(...rows.values());
    if (!items.length) return null;
    return { kind: "list", title: mergingGroups
      ? say(ctx.locale, "All these products will share ONE stock (confirmation required)", "Al deze producten zullen ÉÉN voorraad delen (bevestiging vereist)")
      : say(ctx.locale, "Shared stock afterwards", "Gedeelde voorraad daarna"),
      data: { items } };
  },
  run: async (ctx, input) => {
    if (ctx.user.role === "child") throw forbidden("Only adults link products.");
    if (input.unlink) {
      await unlinkAlternative(ctx.householdId, input.product.id);
      return done(`${input.product.name} no longer shares stock; the stock stayed with the main product.`);
    }
    if (!input.sharesWith) throw badRequest("Which product does it share stock with?");
    const product = await linkAlternative(ctx.user, input.product.id, {
      mainProductId: input.sharesWith.id,
      newMainName: input.sharedName ?? null,
      confirmGroupMerge: input.confirmGroupMerge ?? false,
    });
    return done(`${product.name} now shares stock with ${input.sharedName ?? input.sharesWith.name}.`, { id: product.id });
  },
});

registerAssistantTool({
  name: "inventory.delete",
  description: "Stop keeping a product at a place (give product + place), or delete a product from the catalogue with all its stock (product only).",
  input: z.object({ product: entityRef("product"), place: entityRef("place", "Only the stock at this place").optional() }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted from the stock", nl: "Uit de voorraad verwijderd" },
  describe: (ctx, input) =>
    input.place
      ? say(ctx.locale, `Stop keeping ${input.product.name} in ${input.place.name}`, `${input.product.name} niet meer bijhouden in ${input.place.name}`)
      : say(ctx.locale, `Delete the product ${input.product.name} and all its stock`, `Product ${input.product.name} en al zijn voorraad verwijderen`),
  preview: async (ctx, input) => {
    if (input.place) return null;
    const stock = await listStock(ctx.householdId, { productId: input.product.id });
    if (!stock.length) return null;
    return {
      kind: "list",
      title: say(ctx.locale, "Stock that goes too", "Voorraad die mee verdwijnt"),
      data: { items: stock.map((item) => ({ label: item.placeName, detail: amount(item.quantity, item.unit, ctx.locale), tone: "remove" as const })) },
    };
  },
  run: async (ctx, input) => {
    if (input.place) {
      const item = await stockItemOf(ctx, input.product, input.place);
      await deleteStockItem(ctx.householdId, item.id);
      return done(`${input.product.name} is no longer kept in ${input.place.name}.`);
    }
    await deleteProduct(ctx.householdId, input.product.id);
    return done(`Deleted the product ${input.product.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a product's page, the stock overview and the scan screen ──

registerScreenContext({
  kind: "product",
  skills: ["inventory", "shopping"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const [product, stock] = await Promise.all([getProduct(ctx.householdId, id), listStock(ctx.householdId, { productId: id })]);
    const kept = stock.map((item) => {
      const priority = stockPriority(shoppingStockStatus([item], item.placeId), product.isEssential);
      const status = [priority.stockStatus, priority.buyingAdvice].filter(Boolean).join(", ");
      return `"${item.placeName}" ${amount(item.quantity, item.unit, "en")}${status ? ` (${status})` : ""}`;
    }).join(", ");
    return { label: product.name, summary: `product "${product.name}" (${product.isEssential ? "essential" : "nice to have"}); stock: ${kept || "none"}` };
  },
});

registerScreenContext({
  kind: "inventory",
  skills: ["inventory"],
  describe: (ctx) => ({ label: say(ctx.locale, "Inventory", "Voorraad"), summary: "the stock overview (what is kept where)" }),
});

registerScreenContext({
  kind: "scan",
  skills: ["inventory"],
  describe: (ctx) => ({ label: say(ctx.locale, "Scan", "Scannen"), summary: "the scan screen (scan a barcode to use up, restock or count a product)" }),
});

registerAssistantTool({
  name: "inventory.product_context", description: "Read a catalogue product's existing shopping needs, related tasks and projects through their actual requirement links. No project-specific duplicate products, inferred reservations or new purchases. Purchase history is purchases_list with productId.",
  input: z.object({ product: entityRef("product") }), permission: "read", confirm: "never", activity: { en: "Checked product relationships", nl: "Productrelaties bekeken" },
  run: (ctx, input) => getProductContext(ctx.householdId, input.product.id),
});
