import { z } from "zod";
import { idSchema, isoDateSchema } from "@/types/common";
import type { ProjectRef } from "@/types/projects";
import type { ShopRef } from "@/types/shops";
import { isValidStapleRRule } from "./staple-recurrence";
import { canManageHousehold, type HouseholdRole } from "@/types/roles";

// Enums ------------------------------------------------------------------------------------------------

export const PRODUCT_CATEGORIES = [
  "produce",
  "bakery",
  "dairy",
  "meat_fish",
  "pantry",
  "frozen",
  "drinks",
  "household",
  "personal_care",
  "baby",
  "pets",
  "pharmacy",
  "diy",
  "garden",
  "other",
] as const;
export const productCategorySchema = z.enum(PRODUCT_CATEGORIES);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const SHOPPING_LIST_KINDS = ["groceries", "diy", "pharmacy", "other"] as const;
export const shoppingListKindSchema = z.enum(SHOPPING_LIST_KINDS);
export type ShoppingListKind = z.infer<typeof shoppingListKindSchema>;

/** Why an item is on a list. */
export const SHOPPING_ITEM_SOURCES = ["manual", "staple", "task", "low_stock", "recipe"] as const;
export const shoppingItemSourceSchema = z.enum(SHOPPING_ITEM_SOURCES);
export type ShoppingItemSource = z.infer<typeof shoppingItemSourceSchema>;

export const SHOPPING_ITEM_STATUSES = ["open", "bought"] as const;
export const shoppingItemStatusSchema = z.enum(SHOPPING_ITEM_STATUSES);
export type ShoppingItemStatus = z.infer<typeof shoppingItemStatusSchema>;

// Shared field schemas ------------------------------------------------------------------------------------

/** Only web links; never `javascript:` or other schemes we would render as a link. */
export const webUrlSchema = z.url({ protocol: /^https?$/ }).max(1000);
/** Decimal quantities ("1,5 kg") with at most three decimals. */
export const quantitySchema = z.coerce
  .number()
  .positive()
  .max(100_000)
  .transform((value) => Math.round(value * 1000) / 1000);
const unitSchema = z.string().trim().max(20);
const nameSchema = z.string().trim().min(1).max(120);
const noteSchema = z.string().trim().max(500);
/** A web link, or a photo the app stored itself when a barcode was looked up (see types/barcode-lookup.ts). */
export const productImageUrlSchema = z.union([webUrlSchema, z.string().regex(/^\/api\/shopping\/barcode\/\d{8,13}\/image$/)]);

// Products -----------------------------------------------------------------------------------------------

/** Units of a product's content per package (the form's choice). Recipes convert g/ml amounts through it. */
export const PACKAGE_UNITS = ["g", "kg", "ml", "cl", "l", "pcs"] as const;
export const packageUnitSchema = z.enum(PACKAGE_UNITS);

export const productInputSchema = z.object({
  name: nameSchema,
  unit: unitSchema.optional().nullable(),
  /** Content of ONE stock package (200 g; a 6 x 33 cl multipack: 198 cl), with `packageUnit`. */
  packageAmount: z.coerce
    .number()
    .positive()
    .max(1_000_000)
    .transform((value) => Math.round(value * 1000) / 1000)
    .optional()
    .nullable(),
  packageUnit: packageUnitSchema.optional().nullable(),
  category: productCategorySchema.default("other"),
  // Explicit form strings avoid treating the string "false" as truthy. Omitted API fields stay unchanged.
  isEssential: z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean()).optional(),
  defaultShopId: idSchema.optional().nullable(),
  /** EAN/UPC: digits only. */
  barcode: z.string().trim().regex(/^\d{6,14}$/).optional().nullable(),
  qrCode: z.string().trim().max(64).optional().nullable(),
  imageUrl: productImageUrlSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).refine((value) => !value.packageAmount === !value.packageUnit, { message: "packageBoth", path: ["packageAmount"] });
export type ProductInput = z.infer<typeof productInputSchema>;

export const productShopLinkInputSchema = z.object({
  shopId: idSchema,
  url: webUrlSchema.optional().nullable(),
  priceCents: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  articleNumber: z.string().trim().max(40).optional().nullable(),
});
export type ProductShopLinkInput = z.infer<typeof productShopLinkInputSchema>;

/**
 * Body of `PUT /api/shopping/products/:id/alternative`: the product shares stock with `mainProductId` (with
 * its main product, when that is an alternative itself). With `newMainName`, a new generic product of that
 * name (e.g. "Bacon", no barcode) becomes the main product of both instead.
 */
export const productAlternativeInputSchema = z.object({
  mainProductId: idSchema,
  newMainName: nameSchema.optional().nullable(),
});
export type ProductAlternativeInput = z.infer<typeof productAlternativeInputSchema>;

/** Query string of `GET /api/shopping/products`. */
export const productQuerySchema = z.object({
  /** Exact barcode or own QR code (scanning). */
  code: z.string().trim().max(64).optional(),
  q: z.string().trim().max(80).optional(),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

// Lists --------------------------------------------------------------------------------------------------

export const shoppingListInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: shoppingListKindSchema,
});
export type ShoppingListInput = z.infer<typeof shoppingListInputSchema>;

// Items --------------------------------------------------------------------------------------------------

/**
 * Body of `POST /api/shopping/items`. A name, a product or a webshop URL is enough: the name falls back
 * to the product's name or the page title of the URL. Without `listId` the item lands on the default list
 * for its source (created when missing). `source: "task"` needs a `taskId`.
 */
export const shoppingItemCreateSchema = z
  .object({
    name: nameSchema.optional(),
    productId: idSchema.optional().nullable(),
    quantity: quantitySchema.optional(),
    unit: unitSchema.optional().nullable(),
    shopId: idSchema.optional().nullable(),
    url: webUrlSchema.optional().nullable(),
    note: noteSchema.optional().nullable(),
    listId: idSchema.optional().nullable(),
    placeId: idSchema.optional().nullable(),
    source: shoppingItemSourceSchema.default("manual"),
    taskId: idSchema.optional().nullable(),
    /** The project it is for (projects feature): a material. */
    projectId: idSchema.optional().nullable(),
    /** Known or estimated price per unit; otherwise taken from the link or the product's shop link. */
    priceCents: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
  })
  .refine((input) => Boolean(input.name || input.productId || input.url), {
    message: "Give a name, a product or a link",
    path: ["name"],
  })
  // Materials belong to a task, or to a project (they land on the materials list either way).
  .refine((input) => input.source !== "task" || Boolean(input.taskId || input.projectId), {
    message: "A task item needs a taskId",
    path: ["taskId"],
  });
export type ShoppingItemCreateInput = z.infer<typeof shoppingItemCreateSchema>;

/** Body of `PATCH /api/shopping/items/:id`: only the given fields change. */
export const shoppingItemUpdateSchema = z.object({
  name: nameSchema.optional(),
  productId: idSchema.nullable().optional(),
  quantity: quantitySchema.optional(),
  unit: unitSchema.nullable().optional(),
  shopId: idSchema.nullable().optional(),
  url: webUrlSchema.nullable().optional(),
  note: noteSchema.nullable().optional(),
  listId: idSchema.optional(),
  placeId: idSchema.nullable().optional(),
  status: shoppingItemStatusSchema.optional(),
  projectId: idSchema.nullable().optional(),
  /** Known or estimated price per unit (a material's estimate for its project's budget). */
  priceCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  /** The item's own category, used when it has no product (a product's category wins). */
  category: productCategorySchema.nullable().optional(),
  /** Photo, e.g. from its webshop link. */
  imageUrl: productImageUrlSchema.nullable().optional(),
});
export type ShoppingItemUpdateInput = z.infer<typeof shoppingItemUpdateSchema>;

/**
 * The item edit dialog's form: every field is posted, an emptied field clears it (`null`), and the category
 * select posts `none` for "no category".
 */
export const shoppingItemEditSchema = shoppingItemUpdateSchema
  .omit({ status: true, listId: true, placeId: true, projectId: true, category: true })
  .extend({ name: nameSchema, category: z.union([productCategorySchema, z.literal("none")]).optional() });
export type ShoppingItemEditInput = z.infer<typeof shoppingItemEditSchema>;

/** The edit form's values as an update: what is left empty is cleared. */
export function editToUpdate(input: ShoppingItemEditInput): ShoppingItemUpdateInput {
  return {
    name: input.name,
    productId: input.productId ?? null,
    quantity: input.quantity ?? 1,
    unit: input.unit || null,
    shopId: input.shopId ?? null,
    url: input.url ?? null,
    note: input.note || null,
    priceCents: input.priceCents ?? null,
    category: input.category && input.category !== "none" ? input.category : null,
    imageUrl: input.imageUrl ?? null,
  };
}

/** Estimated cost of items: price × quantity of those with a price, and how many have none. */
export function estimateTotal(items: readonly Pick<ShoppingItem, "priceCents" | "quantity">[]): { cents: number; priced: number; unpriced: number } {
  let cents = 0;
  let priced = 0;
  for (const item of items) {
    if (item.priceCents === null) continue;
    cents += Math.round(item.priceCents * item.quantity);
    priced += 1;
  }
  return { cents, priced, unpriced: items.length - priced };
}

/** Shop filter value for items without a preferred shop. */
export const NO_SHOP = "none";

/** Query string of `GET /api/shopping/items`. */
export const shoppingItemQuerySchema = z.object({
  taskId: idSchema.optional(),
  listId: idSchema.optional(),
  /** A shop id, or `none` for items without a shop. */
  shopId: idSchema.optional(),
  placeId: idSchema.optional(),
  status: shoppingItemStatusSchema.optional(),
  /** A project's materials: items of the project and of its tasks. */
  projectId: idSchema.optional(),
});
export type ShoppingItemQuery = z.infer<typeof shoppingItemQuerySchema>;

// Staples ------------------------------------------------------------------------------------------------

export const stapleInputSchema = z.object({
  listId: idSchema,
  productId: idSchema.optional().nullable(),
  name: nameSchema,
  quantity: quantitySchema.default(1),
  unit: unitSchema.optional().nullable(),
  shopId: idSchema.optional().nullable(),
  rrule: z.string().trim().max(100).refine(isValidStapleRRule, "Unsupported repeat rule"),
  startDate: isoDateSchema,
});
export type StapleInput = z.infer<typeof stapleInputSchema>;

// Link preview -------------------------------------------------------------------------------------------

export const linkPreviewInputSchema = z.object({ url: webUrlSchema });
export type LinkPreviewInput = z.infer<typeof linkPreviewInputSchema>;

/** What `POST /api/shopping/link-preview` found on a webshop page. Fields are null when unknown. */
export type LinkPreview = {
  url: string;
  title: string;
  imageUrl: string | null;
  priceCents: number | null;
  /** A known shop whose website matches the URL's domain. */
  shopId: string | null;
  /** False when the page could not be read; `title` is then the URL. */
  fetched: boolean;
};

// Read models --------------------------------------------------------------------------------------------

/** A shop on an item or product link, with its type and logo so `ShopBadge` shows the real logo. */
export type ShoppingShopRef = ShopRef;

export type ProductShopLink = {
  id: string;
  shopId: string;
  shop: ShoppingShopRef;
  url: string | null;
  priceCents: number | null;
  articleNumber: string | null;
};

export type Product = {
  id: string;
  name: string;
  unit: string | null;
  category: ProductCategory;
  isEssential: boolean;
  defaultShopId: string | null;
  barcode: string | null;
  qrCode: string | null;
  imageUrl: string | null;
  notes: string | null;
  /** Content of one stock package (200 g), with its unit; both null when unknown. */
  packageAmount: number | null;
  packageUnit: string | null;
  shopLinks: ProductShopLink[];
  /** Alternatives: the main product this one shares stock with, or null (a main product, or not grouped). */
  stockProductId: string | null;
  /** For a main product: the products that share its stock, by name. Empty for an alternative. */
  alternatives: ProductAlternative[];
};

/** A product that shares a main product's stock (another brand of the same thing). */
export type ProductAlternative = { id: string; name: string; imageUrl: string | null };

export type ShoppingList = {
  id: string;
  name: string;
  kind: ShoppingListKind;
  defaultSource: ShoppingItemSource | null;
  openCount: number;
};

export type ShoppingItem = {
  id: string;
  listId: string;
  listName: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  shopId: string | null;
  shop: ShoppingShopRef | null;
  url: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  note: string | null;
  placeId: string | null;
  placeName: string | null;
  /** The product's category, for grouping in the shop view. */
  category: ProductCategory | null;
  /** The linked product's essential setting; null for items without a catalogue product. */
  isEssential: boolean | null;
  /** Current stock at the item's place, or the lowest stock level across its product's places. */
  stockStatus: ShoppingStockStatus | null;
  source: ShoppingItemSource;
  taskId: string | null;
  status: ShoppingItemStatus;
  /** ISO timestamp. */
  boughtAt: string | null;
  boughtByName: string | null;
  /** ISO timestamp. */
  createdAt: string;
  /** The project it is for (projects feature), or `null`. */
  project: ProjectRef | null;
  /** Set when the purchase was logged as an expense (a project then counts the expense, not the item). */
  expenseId: string | null;
  /** The other products sharing the product's stock ("or: Colruyt bacon"), with their shop links. */
  alternatives: ShoppingItemAlternative[];
  /** The meal on the "To cook" list it was added for (source `recipe`, recipes feature), while that meal exists. */
  recipe?: { entryId: string; recipeId: string; name: string } | null;
};

/** Another product of the item's group: buying that one does as well. */
export type ShoppingItemAlternative = {
  productId: string;
  name: string;
  links: { shop: ShoppingShopRef; url: string | null }[];
};

export type ShoppingStockStatus = "below_minimum" | "at_minimum" | "above_minimum";

/** Current stock labels, with a place-specific item using that place whenever stock is kept there. */
export function shoppingStockStatus(stock: readonly { placeId: string; quantity: number; minQuantity: number | null }[], placeId: string | null): ShoppingStockStatus | null {
  const atPlace = placeId ? stock.filter((item) => item.placeId === placeId) : [];
  const relevant = (atPlace.length ? atPlace : stock).filter((item) => item.minQuantity !== null);
  if (relevant.some((item) => item.minQuantity !== null && item.quantity < item.minQuantity)) return "below_minimum";
  if (relevant.some((item) => item.quantity === item.minQuantity)) return "at_minimum";
  return relevant.length ? "above_minimum" : null;
}

export type ShoppingStaple = {
  id: string;
  listId: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  shopId: string | null;
  rrule: string;
  startDate: string;
  nextDueOn: string;
};

/** `GET /api/shopping`: everything the shopping page shows. */
export type ShoppingOverview = {
  lists: ShoppingList[];
  /** Open items, plus items bought in the last day so a mistaken tick can be undone. */
  items: ShoppingItem[];
  staples: ShoppingStaple[];
};

/** Counts for the dashboard (from the open items). */
export type ShoppingSummary = {
  /** Open items on all lists. */
  open: number;
  /** Distinct shops those items are planned at. */
  shops: number;
};

/** Per task: how many material items it has and how many are bought. */
export type MaterialStatus = { total: number; bought: number };

/**
 * After an item with a product is bought: where it could go in stock. `POST /api/shopping/items/:id/restock`
 * adds it.
 */
export type RestockSuggestion = {
  stockItemId: string;
  placeId: string;
  placeName: string;
  quantity: number;
  unit: string | null;
};

/** Body of `POST /api/shopping/items/:id/restock`. */
export const restockInputSchema = z.object({
  stockItemId: idSchema,
  quantity: quantitySchema,
});
export type RestockInput = z.infer<typeof restockInputSchema>;

/** Response of `PATCH /api/shopping/items/:id`. */
export type ShoppingItemUpdateResult = {
  item: ShoppingItem;
  /** Set when the item was just marked bought and its product is kept in stock somewhere. */
  restock: RestockSuggestion | null;
};

// Helpers shared by the API and the UI -------------------------------------------------------------------

type Role = HouseholdRole;

/** Everyone, children included, adds items and ticks them off. */
export const canAddShoppingItems = (_role: Role) => true;
/** Lists, staples and the product catalogue: adults and owners. Mirrors the API's role check. */
export const canManageShopping = canManageHousehold;

/** The list kind that suits an item source when a default list has to be created. */
export const DEFAULT_LIST_KIND: Record<ShoppingItemSource, ShoppingListKind> = {
  manual: "groceries",
  staple: "groceries",
  task: "diy",
  low_stock: "groceries",
  recipe: "groceries",
};

/** "1", "1,5", "0,25" — no trailing zeros. */
export function formatQuantity(quantity: number, locale: "en" | "nl"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", { maximumFractionDigits: 3 }).format(quantity);
}
