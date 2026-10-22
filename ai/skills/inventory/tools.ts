import { z } from "zod";
import type { StockItem } from "@/features/inventory/types/inventory";
import { PACKAGE_UNITS, PRODUCT_CATEGORIES, formatQuantity, productInputSchema, shoppingStockStatus, type Product } from "@/features/shopping/types/shopping";
import { addDays, todayIn } from "@/types/dates";
import { badRequest, forbidden } from "@/api/lib/http";
import { addMovement, createStockItem, deleteStockItem, getProductStock, listStock, updateStockItem } from "@/api/inventory/inventory.service";
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

/** Skill "inventory": household stock and the product catalogue (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "inventory",
  title: { en: "Stock", nl: "Voorraad" },
  summary: "Household stock and products: below-minimum buying needs, at-minimum warnings, essential or nice-to-have settings, expiry, use/add stock, minimums, barcodes and shop links.",
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
  description: "Stock at or below minimum and expiring soon. Returns stockStatus, buyingAdvice (below = to_buy, at = warning), essential and importance, place and shopping-list presence. All at-or-below stock auto-lists regardless of importance; the person decides what to buy.",
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
  description: "Stock per product/place: quantity, minimum, expiry, stockStatus, buyingAdvice (below = to_buy; at = warning) and essential/nice-to-have importance. Give a product for shared stock and recent changes. Importance never excludes a product from groceries; the person chooses what to buy.",
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
      };
    }
    const query = input.q?.toLowerCase();
    const [rows, products] = await Promise.all([listStock(ctx.householdId, { placeId: input.place?.id }), listProducts(ctx.householdId)]);
    const stock = rows.filter((item) => !query || item.productName.toLowerCase().includes(query));
    const essentialById = new Map(products.map((product) => [product.id, product.isEssential]));
    return { count: stock.length, ...capList(stock, LIST_LIMIT, (item) => stockRow(item, ctx.locale, essentialById.get(item.productId) ?? null)) };
  },
});

const linkText = (product: Product) =>
  product.shopLinks.length
    ? product.shopLinks.map((link) => [link.shop.name, money(link.priceCents), link.url ? "webshop link" : null].filter(Boolean).join(" "))
    : null;

registerAssistantTool({
  name: "inventory.products",
  description: "Product catalogue: name, unit, category, essential flag and importance (essential or nice_to_have), default shop, barcode and shop links. Lists are paginated: pass nextOffset as offset with the same q/limit until hasMore is false to review every product. Set importance with inventory_save_product isEssential true/false. Give a barcode to identify a product.",
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
      name: product.name,
      unit: product.unit,
      category: product.category,
      ...stockPriority(null, product.isEssential),
      defaultShop: product.defaultShopId ? (shopNames.get(product.defaultShopId) ?? null) : null,
      barcode: product.barcode,
      notes: product.notes,
      shops: linkText(product),
      stock: stock?.length ? stock.map((item) => `${item.placeName} ${amount(item.quantity, item.unit, ctx.locale)}`) : null,
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
    const page = capList(products.slice(input.offset), input.limit, (product) => ({ name: product.name, category: product.category, ...stockPriority(null, product.isEssential), unit: product.unit, shops: linkText(product) }));
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

registerAssistantTool({
  name: "inventory.change_stock",
  description: "Use up or add stock of a product, or set its counted quantity (adults only). At or below minimum it goes on groceries: at = warning, below = to buy, regardless of essential setting. Not for changing the minimum.",
  input: z.object({
    product: entityRef("product"),
    place: entityRef("place", "Where it is kept, when it is kept in several places").optional(),
    action: z.enum(["use", "add", "set"]).describe("set = the quantity that is there now (a count)"),
    amount: z.number().min(0).max(100_000),
    note: z.string().trim().max(200).optional(),
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
    if (delta === 0) return done(`${item.productName} in ${item.placeName} is already ${amount(item.quantity, item.unit, ctx.locale)}.`);
    const reason = input.action === "use" ? "scan_use" : input.action === "add" ? "scan_add" : "manual_correction";
    const result = await addMovement(ctx.user, item.id, { delta, reason, note: input.note ?? null });
    const left = amount(result.stockItem.quantity, result.stockItem.unit, ctx.locale);
    const low = result.addedToShoppingList ? " Running low: it is on the shopping list now." : result.stockItem.isLow ? " Running low." : "";
    return done(`${result.stockItem.productName} in ${result.stockItem.placeName}: ${left} now.${low}`);
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
  offer: z.string().trim().max(20).optional().describe("The `offer` from recipes_find_product: stores its webshop link, price, photo and package size"),
  name: z.string().trim().min(1).max(120).optional().describe("Required for a new product (default: the offer's name)"),
  unit: z.string().trim().max(20).optional().describe("How stock is counted, e.g. 'pak', 'st.'"),
  packageAmount: z.number().positive().max(1_000_000).optional().describe("Content of one package, e.g. 200 (with packageUnit 'g'); a 6 x 33 cl pack is 198 cl"),
  packageUnit: z.enum(PACKAGE_UNITS).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  isEssential: z.boolean().optional().describe("True = essential; false = nice to have. Omitted keeps the setting. Both auto-list at or below minimum"),
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
  if (!offer) throw badRequest(`Offer ${input.offer} is unknown or expired: run recipes_find_product again and use its offer.`);
  return offer;
}

registerAssistantTool({
  name: "inventory.save_product",
  description:
    "Add a product to the catalogue or change one (name, unit, content per package, category, essential setting, default shop, barcode, notes); set or remove its link at a shop (webshop page, price). Found online (recipes_find_product)? Pass its `offer`: link, price and photo are stored.",
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
    return input.product
      ? say(ctx.locale, `Change the product ${name}${link}${essential}`, `Product ${name} aanpassen${link}${essential}`)
      : say(ctx.locale, `Add the product ${name}${link}${essential}`, `Product ${name} toevoegen${link}${essential}`);
  },
  // The card shows the webshop link and price (and the photo and package size) that will be stored.
  preview: (ctx, input): AssistantPreview | null => {
    const offer = input.offer ? getOffer(ctx.householdId, input.offer) : null;
    const url = input.linkUrl ?? offer?.url;
    const price = input.linkPrice !== undefined ? toCents(input.linkPrice) : (offer?.priceCents ?? null);
    const shop = input.linkShop?.name ?? offer?.shopName;
    const size = input.packageAmount && input.packageUnit ? `${input.packageAmount} ${input.packageUnit}` : offer?.packageAmount ? `${offer.packageAmount} ${offer.packageUnit}` : null;
    const items = [
      url && shop && { label: say(ctx.locale, `Webshop (${shop})`, `Webshop (${shop})`), detail: [price !== null ? money(price) : null, url].filter(Boolean).join(" · "), tone: "add" as const },
      offer?.imageUrl && { label: say(ctx.locale, "Photo", "Foto"), detail: say(ctx.locale, "from the shop's page", "van de pagina van de winkel"), tone: "add" as const },
      size && { label: say(ctx.locale, "Content per package", "Inhoud per verpakking"), detail: size, tone: "add" as const },
    ].filter((item): item is { label: string; detail: string; tone: "add" } => Boolean(item));
    return items.length ? { kind: "list", title: input.offer || input.product ? say(ctx.locale, "Stored with the product", "Bewaard bij het product") : say(ctx.locale, "Product", "Product"), data: { items } } : null;
  },
  run: async (ctx, input) => {
    const offer = offerOf(ctx, input);
    const current = input.product ? await getProduct(ctx.householdId, input.product.id) : null;
    const changesProduct =
      !current ||
      Boolean(offer) ||
      ["name", "unit", "packageAmount", "packageUnit", "category", "isEssential", "defaultShop", "barcode", "notes"].some((key) => input[key as keyof typeof input] !== undefined);
    let product = current;
    if (changesProduct) {
      const base = productInputSchema.parse({
        name: input.name ?? current?.name ?? offer?.name,
        unit: input.unit ?? current?.unit ?? null,
        // Kept unless given: a change of another field never drops the content per package.
        packageAmount: input.packageAmount ?? (input.packageUnit ? null : current?.packageAmount) ?? null,
        packageUnit: input.packageUnit ?? (input.packageAmount ? null : current?.packageUnit) ?? null,
        category: input.category ?? current?.category ?? "other",
        isEssential: input.isEssential ?? current?.isEssential ?? false,
        defaultShopId: input.defaultShop?.id ?? current?.defaultShopId ?? null,
        barcode: input.barcode ?? current?.barcode ?? null,
        qrCode: current?.qrCode ?? null,
        imageUrl: current?.imageUrl ?? null,
        notes: input.notes ?? current?.notes ?? null,
      });
      const data = offer ? withOffer(base, offer) : base;
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
    const stored = offer ? ` with its ${offer.shopName} link${offer.priceCents !== null ? ` (${money(offer.priceCents)})` : ""}${offer.imageUrl ? " and photo" : ""}` : "";
    return done(`${current ? "Saved" : "Added"} the product ${product.name}${stored}.`, { id: product.id, ...stockPriority(null, product.isEssential) });
  },
});

registerAssistantTool({
  name: "inventory.link_alternative",
  description:
    "Let a product share another product's stock (alternatives: another brand of the same thing): its stock merges into the other's, per place. Optionally name the shared stock (creates a generic product, e.g. \"Bacon\"). Or unlink it from its group (the stock stays).",
  input: z.object({
    product: entityRef("product", "The alternative, e.g. the brand that was bought"),
    sharesWith: entityRef("product", "The product whose stock it shares").optional(),
    sharedName: z.string().trim().min(1).max(120).optional().describe("Name for the shared stock: a new generic product"),
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
    const product = await getProduct(ctx.householdId, input.product.id);
    // An alternative brings no stock of its own; a main product's stock merges per place.
    const [mine, theirs] = await Promise.all([
      product.stockProductId ? [] : listStock(ctx.householdId, { productId: product.id }),
      listStock(ctx.householdId, { productId: input.sharesWith.id }),
    ]);
    if (mine.some((item) => theirs.some((other) => other.id === item.id))) return null;
    const rows = new Map(theirs.map((item) => [item.placeId, { label: item.placeName, detail: amount(item.quantity, item.unit, ctx.locale), tone: undefined as "add" | "change" | undefined }]));
    for (const step of planStockMerge(mine, theirs)) {
      const item = mine.find((candidate) => candidate.id === step.sourceId);
      if (!item) continue;
      rows.set(step.placeId, { label: item.placeName, detail: amount(step.quantity, item.unit, ctx.locale), tone: step.kind === "move" ? "add" : "change" });
    }
    if (rows.size === 0) return null;
    return { kind: "list", title: say(ctx.locale, "Shared stock afterwards", "Gedeelde voorraad daarna"), data: { items: [...rows.values()] } };
  },
  run: async (ctx, input) => {
    if (ctx.user.role === "child") throw forbidden("Only adults link products.");
    if (input.unlink) {
      await unlinkAlternative(ctx.householdId, input.product.id);
      return done(`${input.product.name} no longer shares stock; the stock stayed with the main product.`);
    }
    if (!input.sharesWith) throw badRequest("Which product does it share stock with?");
    const product = await linkAlternative(ctx.user, input.product.id, { mainProductId: input.sharesWith.id, newMainName: input.sharedName ?? null });
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
