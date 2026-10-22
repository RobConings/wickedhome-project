import type { Shop } from "@/features/shops/types/shops";
import type {
  LinkPreview,
  Product,
  ShoppingItem,
  ShoppingList,
  ShoppingOverview,
  ShoppingStaple,
} from "@/features/shopping/types/shopping";
import type { BarcodeLookupResult, ProductSuggestion } from "@/features/shopping/types/barcode-lookup";
import { shopFixtures, shopListFixture } from "../shops/fixtures";

const { colruyt, gamma, delhaize, kruidvat, bol } = shopFixtures;
/** A shop as items and product links carry it (with its type and logo). */
const ref = (shop: Shop) => ({ id: shop.id, name: shop.name, type: shop.type, iconUrl: shop.iconUrl });

function product(fields: Partial<Product> & Pick<Product, "id" | "name" | "category">): Product {
  return {
    unit: null,
    isEssential: false,
    defaultShopId: null,
    barcode: null,
    qrCode: null,
    imageUrl: null,
    notes: null,
    packageAmount: null,
    packageUnit: null,
    shopLinks: [],
    stockProductId: null,
    alternatives: [],
    ...fields,
  };
}

export const productFixtures = {
  milk: product({ id: "pr-milk", name: "Halfvolle melk", category: "dairy", isEssential: true, unit: "l", defaultShopId: colruyt.id, barcode: "5400141020458" }),
  bread: product({ id: "pr-bread", name: "Volkorenbrood", category: "bakery", defaultShopId: colruyt.id }),
  eggs: product({ id: "pr-eggs", name: "Scharreleieren", category: "dairy", unit: "pcs", defaultShopId: colruyt.id }),
  bananas: product({ id: "pr-bananas", name: "Bananen", category: "produce", unit: "kg", defaultShopId: colruyt.id }),
  coffee: product({
    id: "pr-coffee",
    name: "Koffiebonen Bio",
    category: "pantry",
    unit: "pack",
    defaultShopId: colruyt.id,
    barcode: "5410013108009",
    shopLinks: [
      { id: "pl-coffee-colruyt", shopId: colruyt.id, shop: ref(colruyt), url: null, priceCents: 899, articleNumber: "12345" },
      { id: "pl-coffee-delhaize", shopId: delhaize.id, shop: ref(delhaize), url: "https://www.delhaize.be/nl/koffiebonen", priceCents: 1049, articleNumber: null },
    ],
  }),
  pasta: product({ id: "pr-pasta", name: "Spaghetti", category: "pantry", unit: "pack", defaultShopId: colruyt.id, barcode: "8076802085738" }),
  tablets: product({ id: "pr-tablets", name: "Vaatwastabletten", category: "household", unit: "box", defaultShopId: colruyt.id }),
  toiletPaper: product({ id: "pr-toilet-paper", name: "Toiletpapier", category: "household", unit: "pack", defaultShopId: kruidvat.id }),
  nailGun: product({
    id: "pr-nail-gun",
    name: "Tacker / nietpistool",
    category: "diy",
    defaultShopId: gamma.id,
    shopLinks: [
      { id: "pl-nail-gun-gamma", shopId: gamma.id, shop: ref(gamma), url: "https://www.gamma.be/nl/assortiment/tacker/p/B123456", priceCents: 2499, articleNumber: "B123456" },
      { id: "pl-nail-gun-bol", shopId: bol.id, shop: ref(bol), url: "https://www.bol.com/be/nl/p/tacker/9300000123/", priceCents: 2199, articleNumber: null },
    ],
  }),
  sheeting: product({ id: "pr-sheeting", name: "Afdekfolie 4 × 5 m", category: "diy", unit: "roll", defaultShopId: gamma.id }),
  screws: product({ id: "pr-screws", name: "Spaanplaatschroeven 4 × 40", category: "diy", unit: "box", defaultShopId: gamma.id, qrCode: "WH-P-SCR440" }),
  // Alternatives: two brands of bacon share the stock of the generic "Spekblokjes".
  bacon: product({
    id: "pr-bacon",
    name: "Spekblokjes",
    category: "meat_fish",
    unit: "pack",
    defaultShopId: colruyt.id,
    alternatives: [
      { id: "pr-bacon-colruyt", name: "Boni spekblokjes", imageUrl: null },
      { id: "pr-bacon-delhaize", name: "Delhaize spekblokjes", imageUrl: null },
    ],
  }),
  baconColruyt: product({
    id: "pr-bacon-colruyt",
    name: "Boni spekblokjes",
    category: "meat_fish",
    unit: "pack",
    defaultShopId: colruyt.id,
    barcode: "5400141123456",
    stockProductId: "pr-bacon",
    shopLinks: [{ id: "pl-bacon-colruyt", shopId: colruyt.id, shop: ref(colruyt), url: "https://www.colruyt.be/nl/producten/boni-spekblokjes", priceCents: 229, articleNumber: null }],
  }),
  baconDelhaize: product({
    id: "pr-bacon-delhaize",
    name: "Delhaize spekblokjes",
    category: "meat_fish",
    unit: "pack",
    defaultShopId: delhaize.id,
    barcode: "5400113654321",
    stockProductId: "pr-bacon",
    shopLinks: [{ id: "pl-bacon-delhaize", shopId: delhaize.id, shop: ref(delhaize), url: "https://www.delhaize.be/nl/spekblokjes", priceCents: 259, articleNumber: null }],
  }),
};

export const productListFixture: Product[] = Object.values(productFixtures).sort((a, b) => a.name.localeCompare(b.name));

export const listFixtures = {
  weekly: { id: "l-weekly", name: "Weekly groceries", kind: "groceries", defaultSource: "manual", openCount: 6 },
  jobs: { id: "l-jobs", name: "Materials for jobs", kind: "diy", defaultSource: "task", openCount: 2 },
  low: { id: "l-low", name: "Running low", kind: "groceries", defaultSource: "low_stock", openCount: 3 },
  pharmacy: { id: "l-pharmacy", name: "Pharmacy", kind: "pharmacy", defaultSource: null, openCount: 1 },
} satisfies Record<string, ShoppingList>;

const lists = Object.values(listFixtures);

function item(fields: Partial<ShoppingItem> & Pick<ShoppingItem, "id" | "name" | "listId">): ShoppingItem {
  const list = lists.find((candidate) => candidate.id === fields.listId);
  return {
    listName: list?.name ?? "",
    productId: null,
    quantity: 1,
    unit: null,
    shopId: null,
    shop: null,
    url: null,
    imageUrl: null,
    priceCents: null,
    note: null,
    placeId: null,
    placeName: null,
    category: null,
    isEssential: fields.productId ? productListFixture.find((product) => product.id === fields.productId)?.isEssential ?? false : null,
    stockStatus: null,
    source: "manual",
    taskId: null,
    status: "open",
    boughtAt: null,
    boughtByName: null,
    createdAt: "2026-09-28T08:00:00.000Z",
    project: null,
    expenseId: null,
    alternatives: [],
    ...fields,
  };
}

export const JACUZZI_TASK_ID = "t-jacuzzi";

export const itemFixtures = {
  milk: item({ id: "i-milk", listId: "l-weekly", name: "Halfvolle melk", productId: "pr-milk", quantity: 2, unit: "l", shopId: colruyt.id, shop: ref(colruyt), category: "dairy", source: "staple" }),
  bread: item({ id: "i-bread", listId: "l-weekly", name: "Volkorenbrood", productId: "pr-bread", shopId: colruyt.id, shop: ref(colruyt), category: "bakery", source: "staple" }),
  eggs: item({ id: "i-eggs", listId: "l-weekly", name: "Scharreleieren", productId: "pr-eggs", quantity: 12, unit: "pcs", shopId: colruyt.id, shop: ref(colruyt), category: "dairy", source: "staple" }),
  bananas: item({ id: "i-bananas", listId: "l-weekly", name: "Bananen", productId: "pr-bananas", quantity: 1.5, unit: "kg", shopId: colruyt.id, shop: ref(colruyt), category: "produce" }),
  tomatoes: item({ id: "i-tomatoes", listId: "l-weekly", name: "Trostomaten", shopId: colruyt.id, shop: ref(colruyt), note: "Rijpe, voor de soep" }),
  coffee: item({ id: "i-coffee", listId: "l-low", name: "Koffiebonen Bio", productId: "pr-coffee", stockStatus: "below_minimum", quantity: 2, unit: "pack", shopId: colruyt.id, shop: ref(colruyt), priceCents: 899, category: "pantry", source: "low_stock", placeId: "p-pantry", placeName: "Pantry" }),
  tablets: item({ id: "i-tablets", listId: "l-low", name: "Vaatwastabletten", productId: "pr-tablets", stockStatus: "at_minimum", unit: "box", shopId: colruyt.id, shop: ref(colruyt), category: "household", source: "low_stock", placeId: "p-pantry", placeName: "Pantry" }),
  nailGun: item({
    id: "i-nail-gun",
    listId: "l-jobs",
    name: "Tacker / nietpistool",
    productId: "pr-nail-gun",
    shopId: gamma.id,
    shop: ref(gamma),
    url: "https://www.gamma.be/nl/assortiment/tacker/p/B123456",
    priceCents: 2499,
    category: "diy",
    source: "task",
    taskId: JACUZZI_TASK_ID,
    placeId: "p-jacuzzi",
    placeName: "Jacuzzi",
  }),
  sheeting: item({ id: "i-sheeting", listId: "l-jobs", name: "Afdekfolie 4 × 5 m", productId: "pr-sheeting", quantity: 2, unit: "roll", shopId: gamma.id, shop: ref(gamma), category: "diy", source: "task", taskId: JACUZZI_TASK_ID, placeId: "p-jacuzzi", placeName: "Jacuzzi" }),
  screws: item({ id: "i-screws", listId: "l-weekly", name: "Spaanplaatschroeven 4 × 40", productId: "pr-screws", unit: "box", shopId: gamma.id, shop: ref(gamma), category: "diy", source: "low_stock", placeId: "p-garage", placeName: "Garage" }),
  bacon: item({
    id: "i-bacon",
    listId: "l-low",
    name: "Spekblokjes",
    productId: "pr-bacon",
    quantity: 2,
    unit: "pack",
    shopId: colruyt.id,
    shop: ref(colruyt),
    category: "meat_fish",
    source: "low_stock",
    placeId: "p-kitchen",
    placeName: "Kitchen",
    alternatives: [
      { productId: "pr-bacon-colruyt", name: "Boni spekblokjes", links: [{ shop: ref(colruyt), url: "https://www.colruyt.be/nl/producten/boni-spekblokjes" }] },
      { productId: "pr-bacon-delhaize", name: "Delhaize spekblokjes", links: [{ shop: ref(delhaize), url: "https://www.delhaize.be/nl/spekblokjes" }] },
    ],
  }),
  plasters: item({ id: "i-plasters", listId: "l-pharmacy", name: "Pleisters", note: "Waterbestendig" }),
  candles: item({ id: "i-candles", listId: "l-weekly", name: "Verjaardagskaarsjes", quantity: 8 }),
  yoghurt: item({
    id: "i-yoghurt",
    listId: "l-weekly",
    name: "Griekse yoghurt",
    shopId: colruyt.id,
    shop: ref(colruyt),
    category: "dairy",
    status: "bought",
    boughtAt: "2026-10-02T09:12:00.000Z",
    boughtByName: "Jan",
  }),
};

export const itemListFixture: ShoppingItem[] = Object.values(itemFixtures);

export const stapleFixtures: ShoppingStaple[] = [
  { id: "st-milk", listId: "l-weekly", productId: "pr-milk", name: "Halfvolle melk", quantity: 2, unit: "l", shopId: colruyt.id, rrule: "FREQ=WEEKLY", startDate: "2026-09-05", nextDueOn: "2026-10-03" },
  { id: "st-bread", listId: "l-weekly", productId: "pr-bread", name: "Volkorenbrood", quantity: 1, unit: null, shopId: colruyt.id, rrule: "FREQ=WEEKLY", startDate: "2026-09-05", nextDueOn: "2026-10-03" },
  { id: "st-eggs", listId: "l-weekly", productId: "pr-eggs", name: "Scharreleieren", quantity: 12, unit: "pcs", shopId: colruyt.id, rrule: "FREQ=WEEKLY;INTERVAL=2", startDate: "2026-09-12", nextDueOn: "2026-10-10" },
  { id: "st-toilet-paper", listId: "l-weekly", productId: "pr-toilet-paper", name: "Toiletpapier", quantity: 1, unit: "pack", shopId: kruidvat.id, rrule: "FREQ=MONTHLY", startDate: "2026-09-01", nextDueOn: "2026-11-01" },
];

export const shoppingOverviewFixture: ShoppingOverview = { lists, items: itemListFixture, staples: stapleFixtures };

export const shoppingPageFixture = { overview: shoppingOverviewFixture, shops: shopListFixture, products: productListFixture };

export const emptyShoppingPageFixture = {
  overview: { lists: [listFixtures.weekly], items: [], staples: [] },
  shops: shopListFixture,
  products: productListFixture,
};

export const productSelectionsFixture = {
  favoriteIds: [productFixtures.milk.id, productFixtures.coffee.id],
  recentIds: [productFixtures.nailGun.id, productFixtures.bananas.id, productFixtures.bread.id],
};

export { shopListFixture, shopSelectionsFixture } from "../shops/fixtures";

/** Pretends to read a webshop page (stories have no API). */
export async function fakeLinkPreview(url: string): Promise<LinkPreview> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (url.includes("gamma.be")) {
    return { url, title: "Tacker / nietpistool 6–14 mm", imageUrl: null, priceCents: 2499, shopId: gamma.id, fetched: true };
  }
  return { url, title: url, imageUrl: null, priceCents: null, shopId: null, fetched: false };
}

/**
 * For `beforeEach` in Loading / Failed stories of components that fetch their own data: every `/api`
 * request hangs (`stallApi`) or fails like a dropped connection (`failApi`). Returns the cleanup.
 */
export function stallApi() {
  return replaceApiFetch(() => new Promise<never>(() => undefined));
}

export function failApi() {
  return replaceApiFetch(() => Promise.reject(new TypeError("Failed to fetch")));
}

function replaceApiFetch(respond: () => Promise<Response>) {
  const original = window.fetch;
  window.fetch = (input, init) => (String(input instanceof Request ? input.url : input).includes("/api/") ? respond() : original(input, init));
  return () => {
    window.fetch = original;
  };
}

/** Task materials for "Insulate the jacuzzi". */
export const taskMaterialsFixture = {
  items: [itemFixtures.nailGun, { ...itemFixtures.sheeting, status: "bought" as const, boughtByName: "Sofie", boughtAt: "2026-10-01T15:30:00.000Z" }],
  products: productListFixture,
  shops: shopListFixture,
};

// Barcode auto-fill ------------------------------------------------------------------------------------------

/** A drawn can, so stories show a photo without any network. */
const canPhoto = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 120"><rect width="80" height="120" fill="#fff"/><rect x="18" y="8" width="44" height="104" rx="8" fill="#d62828"/><rect x="18" y="8" width="44" height="10" rx="4" fill="#adb5bd"/><path d="M24 62c10-14 22 10 32-6" stroke="#fff" stroke-width="5" fill="none"/></svg>',
)}`;

export const suggestionFixtures = {
  /** Found, with a photo: a can of cola. */
  cola: {
    code: "5449000000996",
    name: "Coca-Cola",
    brand: "Coca-Cola",
    genericName: "Frisdrank",
    quantity: { text: "330 ml", amount: 330, unit: "ml", count: 1 },
    category: "drinks",
    imageUrl: canPhoto,
    productName: "Coca-Cola 330 ml",
  },
  /** Found, without a photo: a dish soap. */
  dishSoap: {
    code: "8700216011167",
    name: "Dreft originele",
    brand: "Dreft",
    genericName: null,
    quantity: { text: "6 x 33 cl", amount: 33, unit: "cl", count: 6 },
    category: "household",
    imageUrl: null,
    productName: "Dreft originele 6 x 33 cl",
  },
} satisfies Record<string, ProductSuggestion>;

/** Pretends to look a barcode up (stories have no API): the cola and the dish soap are known. */
export async function fakeBarcodeLookup(code: string): Promise<BarcodeLookupResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  const suggestion = Object.values(suggestionFixtures).find((candidate) => candidate.code === code) ?? null;
  return { code, status: suggestion ? "found" : "not_found", suggestion };
}

/** A lookup that never answers (the "Looking up…" state). */
export const stalledBarcodeLookup = () => new Promise<never>(() => undefined);

/** A lookup that can't reach anything (offline). */
export const failedBarcodeLookup = async (code: string): Promise<BarcodeLookupResult> => ({ code, status: "unavailable", suggestion: null });
