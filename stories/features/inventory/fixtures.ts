import type { ProductStock, ScanResult, StockItem, StockMovement } from "@/features/inventory/types/inventory";
import type { Place } from "@/features/places/types/places";
import { placeFixtures } from "../places/fixtures";
import { productFixtures, productListFixture, shopListFixture } from "../shopping/fixtures";

const room = (id: string, name: string, color: string, icon: string | null, floorName = "Ground floor"): Place => ({
  id,
  name,
  kind: "room",
  floorId: "f-ground",
  floorName,
  color,
  icon,
  polygon: null,
  areaM2: null,
});

export const inventoryPlaceFixtures = {
  pantry: room("p-pantry", "Pantry", "#c9a227", "🥫"),
  garage: room("p-garage", "Garage", "#6b7280", "🔧"),
  kitchen: placeFixtures.kitchen,
  bathroom: placeFixtures.bathroom,
};

export const inventoryPlaceListFixture: Place[] = Object.values(inventoryPlaceFixtures);

function stock(fields: Partial<StockItem> & Pick<StockItem, "id" | "productId" | "productName" | "placeId" | "placeName" | "quantity">): StockItem {
  const minQuantity = fields.minQuantity ?? null;
  return {
    unit: null,
    minQuantity,
    expiresOn: null,
    isLow: minQuantity !== null && fields.quantity < minQuantity,
    updatedAt: "2026-10-01T18:00:00.000Z",
    ...fields,
  };
}

const { pantry, garage, kitchen, bathroom } = inventoryPlaceFixtures;

export const stockFixtures = {
  coffee: stock({ id: "sk-coffee", productId: "pr-coffee", productName: "Koffiebonen Bio", placeId: pantry.id, placeName: pantry.name, quantity: 1, unit: "pack", minQuantity: 2 }),
  pasta: stock({ id: "sk-pasta", productId: "pr-pasta", productName: "Spaghetti", placeId: pantry.id, placeName: pantry.name, quantity: 4, unit: "pack", minQuantity: 2, expiresOn: "2027-03-01" }),
  tablets: stock({ id: "sk-tablets", productId: "pr-tablets", productName: "Vaatwastabletten", placeId: pantry.id, placeName: pantry.name, quantity: 0, unit: "box", minQuantity: 1 }),
  milk: stock({ id: "sk-milk", productId: "pr-milk", productName: "Halfvolle melk", placeId: kitchen.id, placeName: kitchen.name, quantity: 3, unit: "l", minQuantity: 2, expiresOn: "2026-10-06" }),
  eggs: stock({ id: "sk-eggs", productId: "pr-eggs", productName: "Scharreleieren", placeId: kitchen.id, placeName: kitchen.name, quantity: 8, unit: "pcs", minQuantity: 6, expiresOn: "2026-10-14" }),
  screws: stock({ id: "sk-screws", productId: "pr-screws", productName: "Spaanplaatschroeven 4 × 40", placeId: garage.id, placeName: garage.name, quantity: 0.5, unit: "box", minQuantity: 1 }),
  sheeting: stock({ id: "sk-sheeting", productId: "pr-sheeting", productName: "Afdekfolie 4 × 5 m", placeId: garage.id, placeName: garage.name, quantity: 1, unit: "roll" }),
  toiletPaperBathroom: stock({ id: "sk-tp-bathroom", productId: "pr-toilet-paper", productName: "Toiletpapier", placeId: bathroom.id, placeName: bathroom.name, quantity: 6, unit: "rolls", minQuantity: 4 }),
  bacon: stock({ id: "sk-bacon", productId: "pr-bacon", productName: "Spekblokjes", placeId: kitchen.id, placeName: kitchen.name, quantity: 3, unit: "pack", minQuantity: 2, expiresOn: "2026-10-20" }),
  coffeeKitchen: stock({ id: "sk-coffee-kitchen", productId: "pr-coffee", productName: "Koffiebonen Bio", placeId: kitchen.id, placeName: kitchen.name, quantity: 1, unit: "pack" }),
};

export const stockListFixture: StockItem[] = Object.values(stockFixtures);

export const inventoryPageFixture = {
  stock: stockListFixture,
  products: productListFixture,
  places: inventoryPlaceListFixture,
  shops: shopListFixture,
};

const movement = (fields: Partial<StockMovement> & Pick<StockMovement, "id" | "delta" | "quantityAfter" | "reason" | "createdAt">): StockMovement => ({
  stockItemId: "sk-coffee",
  placeName: pantry.name,
  userName: "Sofie",
  note: null,
  ...fields,
});

export const coffeeStockFixture: ProductStock = {
  productId: "pr-coffee",
  stockItems: [stockFixtures.coffee, stockFixtures.coffeeKitchen],
  movements: [
    movement({ id: "m-5", delta: -1, quantityAfter: 1, reason: "scan_use", createdAt: "2026-10-02T07:41:00.000Z", userName: "Jan" }),
    movement({ id: "m-4", delta: -1, quantityAfter: 1, reason: "scan_use", createdAt: "2026-09-30T07:15:00.000Z", stockItemId: "sk-coffee-kitchen", placeName: kitchen.name }),
    movement({ id: "m-3", delta: 1, quantityAfter: 2, reason: "scan_add", createdAt: "2026-09-29T19:02:00.000Z", stockItemId: "sk-coffee-kitchen", placeName: kitchen.name }),
    movement({ id: "m-2", delta: 3, quantityAfter: 3, reason: "bought", createdAt: "2026-09-27T11:20:00.000Z", userName: "Jan" }),
    movement({ id: "m-1", delta: -1, quantityAfter: 0, reason: "manual_correction", createdAt: "2026-09-20T10:00:00.000Z", note: "Pak was open en verlopen" }),
  ],
};

export const productStockPageFixture = {
  product: productFixtures.coffee,
  stock: coffeeStockFixture,
  places: inventoryPlaceListFixture,
  shops: shopListFixture,
  products: productListFixture,
  highlightId: null as string | null,
};

/** The generic "Spekblokjes", whose stock two brands share. */
export const baconStockPageFixture = {
  product: productFixtures.bacon,
  stock: {
    productId: "pr-bacon",
    stockItems: [stockFixtures.bacon],
    movements: [
      movement({ id: "m-b-2", delta: 2, quantityAfter: 3, reason: "manual_correction", createdAt: "2026-10-08T18:20:00.000Z", stockItemId: "sk-bacon", placeName: kitchen.name, note: "Merged from Delhaize spekblokjes" }),
      movement({ id: "m-b-1", delta: 1, quantityAfter: 1, reason: "bought", createdAt: "2026-10-05T11:00:00.000Z", stockItemId: "sk-bacon", placeName: kitchen.name }),
    ],
  } satisfies ProductStock,
  places: inventoryPlaceListFixture,
  shops: shopListFixture,
  products: productListFixture,
  highlightId: null as string | null,
};

export const scanPageFixture = { products: productListFixture, places: inventoryPlaceListFixture, shops: shopListFixture };

export const scanResultFixtures = {
  /** Spaghetti: kept in one place. */
  known: { code: "8076802085738", productId: "pr-pasta", scannedProductId: "pr-pasta", stockItems: [stockFixtures.pasta] } satisfies ScanResult,
  /** Coffee: kept in the pantry and the kitchen, so a scan asks where. */
  twoPlaces: { code: "5410013108009", productId: "pr-coffee", scannedProductId: "pr-coffee", stockItems: [stockFixtures.coffee, stockFixtures.coffeeKitchen] } satisfies ScanResult,
  /** A brand of bacon: its scan acts on the stock it shares with "Spekblokjes". */
  alternative: { code: "5400141123456", productId: "pr-bacon", scannedProductId: "pr-bacon-colruyt", stockItems: [stockFixtures.bacon] } satisfies ScanResult,
  /** A can of cola nobody added yet. */
  unknown: { code: "5449000000996", productId: null, scannedProductId: null, stockItems: [] } satisfies ScanResult,
};

export const placeSelectionsFixture = { favoriteIds: ["p-pantry", "p-kitchen"], recentIds: ["p-garage", "p-pantry"] };

/** Pretends to look up a code (stories have no API). */
export async function fakeScan(code: string): Promise<ScanResult> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return Object.values(scanResultFixtures).find((result) => result.code === code) ?? { code, productId: null, scannedProductId: null, stockItems: [] };
}
