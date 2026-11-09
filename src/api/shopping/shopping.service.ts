import { householdStockUnit } from "@/types/units";
import { withShoppingEvents, publishShoppingChanged } from "./shopping-events";
import type { SessionUser } from "@/features/auth/types/auth";
import { restockAmount } from "@/features/inventory/types/inventory";
import {
  DEFAULT_LIST_KIND,
  NO_SHOP,
  shoppingStockStatus,
  type LinkPreview,
  type MaterialStatus,
  type Product,
  type ProductCategory,
  type ProductInput,
  type ProductAlternativeInput,
  type ProductQuery,
  type ProductShopLinkInput,
  type ShoppingItem,
  type ShoppingItemAlternative,
  type ShoppingItemCreateInput,
  type ShoppingItemQuery,
  type ShoppingItemSource,
  type ShoppingItemStatus,
  type ShoppingItemUpdateInput,
  type ShoppingList,
  type ShoppingListInput,
  type ShoppingListKind,
  type ShoppingOverview,
  type ShoppingStaple,
  type StapleInput,
} from "@/features/shopping/types/shopping";
import { shopForUrl } from "@/features/shopping/types/shop-links";
import { nextStapleOccurrence, parseStapleRRule } from "@/features/shopping/types/staple-recurrence";
import { combineShoppingItems, shoppingAmount, shoppingItemListIds } from "@/features/shopping/types/shopping-product-rows";
import { shoppingProductDetails } from "@/features/shopping/types/shopping-product-details";
import type { Locale } from "@/types/common";
import { addDays, todayIn } from "@/types/dates";
import {
  db,
  type Prisma,
  type ProductCategory as ProductCategoryRow,
  type ShoppingItemSource as SourceRow,
  type ShoppingListKind as ListKindRow,
} from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { forgetEntity } from "../selections/selections.service";
import { getShop, listShops, shopRefSelect, toShopRef } from "../shops/shops.service";
import { UnsafeUrlError, bareHost, fetchPage, parsePageMetadata } from "./link-preview";
import { linkProblem, mergeNote, stockCompatibilityProblem, planStockMerge, promotionCandidate, stockOwnerOf } from "./product-alternatives";
import { lockStock } from "../inventory/stock-lock";

// Mapping ------------------------------------------------------------------------------------------------

const toSource = (source: SourceRow) => source.toLowerCase() as ShoppingItemSource;
const fromSource = (source: ShoppingItemSource) => source.toUpperCase() as SourceRow;
const toKind = (kind: ListKindRow) => kind.toLowerCase() as ShoppingListKind;
const fromKind = (kind: ShoppingListKind) => kind.toUpperCase() as ListKindRow;
const toCategory = (category: ProductCategoryRow) => category.toLowerCase() as ProductCategory;
const fromCategory = (category: ProductCategory) => category.toUpperCase() as ProductCategoryRow;
const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const today = () => todayIn();

const shoppingStockSelect = { placeId: true, quantity: true, minQuantity: true, unit: true } as const;

const itemInclude = {
  list: { select: { name: true } },
  shop: { select: shopRefSelect },
  place: { select: { name: true } },
  // The category, and whether the product shares stock with others (alternatives: "or: …" on the row).
  product: { select: {
    unit: true,
    packageAmount: true,
    packageUnit: true,
    category: true,
    isEssential: true,
    stockProductId: true,
    stockItems: { select: shoppingStockSelect },
    stockProduct: { select: { stockItems: { select: shoppingStockSelect } } },
    _count: { select: { alternatives: true } },
  } },
  // The project chip (projects feature).
  project: { select: { id: true, name: true, color: true } },
} as const;
type ItemRow = Prisma.ShoppingItemGetPayload<{ include: typeof itemInclude }>;

const productInclude = {
  stockItems: { select: { unit: true } },
  stockProduct: { select: { stockItems: { select: { unit: true } } } },
  shopLinks: { include: { shop: { select: shopRefSelect } } },
  alternatives: { select: { id: true, name: true, imageUrl: true }, orderBy: { name: "asc" } },
} as const;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/** The stock owner of the item's product when that product is in a group of alternatives. */
const groupOwnerOf = (row: ItemRow) =>
  row.productId && row.product && (row.product.stockProductId || row.product._count.alternatives > 0)
    ? stockOwnerOf({ id: row.productId, stockProductId: row.product.stockProductId })
    : null;

type RecipeRef = NonNullable<ShoppingItem["recipe"]>;

function toItem(row: ItemRow, names: Map<string, string>, groups: Map<string, ShoppingItemAlternative[]>, recipes: Map<string, RecipeRef>): ShoppingItem {
  const owner = groupOwnerOf(row);
  const stock = row.product?.stockProduct?.stockItems ?? row.product?.stockItems ?? [];
  return {
    id: row.id,
    listId: row.listId,
    listName: row.list.name,
    productId: row.productId,
    name: row.name,
    quantity: row.quantity.toNumber(),
    unit: row.unit,
    shopId: row.shopId,
    shop: row.shop && toShopRef(row.shop),
    url: row.url,
    imageUrl: row.imageUrl,
    priceCents: row.priceCents,
    note: row.note,
    placeId: row.placeId,
    placeName: row.place?.name ?? null,
    // The product's category; an item without one may have its own (set in the edit dialog).
    category: row.product ? toCategory(row.product.category) : row.category ? toCategory(row.category) : null,
    isEssential: row.product?.isEssential ?? null,
    stockStatus: shoppingStockStatus(stock.map((item) => ({
      placeId: item.placeId,
      quantity: item.quantity.toNumber(),
      minQuantity: item.minQuantity?.toNumber() ?? null,
    })), row.placeId),
    source: toSource(row.source),
    taskId: row.taskId,
    status: row.status.toLowerCase() as ShoppingItemStatus,
    updatedAt: row.updatedAt?.toISOString(),
    boughtAt: row.boughtAt?.toISOString() ?? null,
    boughtByName: row.boughtByUserId ? (names.get(row.boughtByUserId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    project: row.project ? { id: row.project.id, name: row.project.name, color: row.project.color } : null,
    expenseId: row.expenseId,
    alternatives: owner ? (groups.get(owner) ?? []).filter((alternative) => alternative.productId !== row.productId) : [],
    recipe: row.mealPlanEntryId ? (recipes.get(row.mealPlanEntryId) ?? null) : null,
  };
}

/** The meals ("To cook", recipes feature) items were added for, by entry id: the "For Spaghetti" badge. */
async function itemRecipes(householdId: string, rows: ItemRow[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.mealPlanEntryId ? [row.mealPlanEntryId] : [])))];
  if (ids.length === 0) return new Map<string, RecipeRef>();
  const entries = await db.mealPlanEntry.findMany({
    where: { householdId, id: { in: ids } },
    select: { id: true, recipe: { select: { id: true, name: true } } },
  });
  return new Map(entries.map((entry) => [entry.id, { entryId: entry.id, recipeId: entry.recipe.id, name: entry.recipe.name }]));
}

/** Per stock owner of the items' grouped products: every product of that group, with its shop links. */
async function itemGroups(householdId: string, rows: ItemRow[]) {
  const owners = [...new Set(rows.flatMap((row) => groupOwnerOf(row) ?? []))];
  const groups = new Map<string, ShoppingItemAlternative[]>();
  if (owners.length === 0) return groups;
  const members = await db.product.findMany({
    where: { householdId, OR: [{ id: { in: owners } }, { stockProductId: { in: owners } }] },
    select: { id: true, name: true, stockProductId: true, shopLinks: { select: { url: true, shop: { select: shopRefSelect } } } },
    orderBy: { name: "asc" },
  });
  for (const member of members) {
    const owner = stockOwnerOf(member);
    const group = groups.get(owner) ?? [];
    group.push({
      productId: member.id,
      name: member.name,
      links: member.shopLinks.map((link) => ({ shop: toShopRef(link.shop), url: link.url })).sort((a, b) => a.shop.name.localeCompare(b.shop.name)),
    });
    groups.set(owner, group);
  }
  return groups;
}

/** Display names of the users who ticked items off. */
async function boughtByNames(householdId: string, rows: ItemRow[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.boughtByUserId ? [row.boughtByUserId] : [])))];
  if (ids.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({
    where: { householdId, id: { in: ids } },
    select: { id: true, email: true, habitant: { select: { name: true } } },
  });
  return new Map(users.map((user) => [user.id, user.habitant?.name ?? user.email]));
}

async function toItems(householdId: string, rows: ItemRow[], roundPackages = true) {
  const [names, groups, recipes] = await Promise.all([boughtByNames(householdId, rows), itemGroups(householdId, rows), itemRecipes(householdId, rows)]);
  const products = new Map(rows.flatMap((row) => row.productId && row.product ? [[row.productId, {
    unit: householdStockUnit(row.product.unit, row.product.stockProduct?.stockItems ?? row.product.stockItems), packageAmount: row.product.packageAmount?.toNumber() ?? null, packageUnit: row.product.packageUnit,
  }] as const] : []));
  return combineShoppingItems(rows.map((row) => toItem(row, names, groups, recipes)), products, roundPackages);
}

/** Repair old free-text copies only when their full name has one exact catalogue match. */
async function linkExactUnlinkedRows(householdId: string, tx: Prisma.TransactionClient = db): Promise<boolean> {
  const rows = (await tx.shoppingItem.findMany({
    where: { householdId, status: "OPEN", productId: null },
    select: { id: true, name: true, productId: true, unit: true, shopId: true, url: true, imageUrl: true, priceCents: true },
  })).filter((row) => row.productId === null);
  if (!rows.length) return false;
  const products = await tx.product.findMany({ where: { householdId }, select: {
    id: true, name: true, unit: true, defaultShopId: true, imageUrl: true,
    shopLinks: { select: { shopId: true, url: true, priceCents: true } },
  } });
  const key = (name: string) => name.trim().normalize("NFC").toLowerCase();
  let changed = false;
  for (const row of rows) {
    const matches = products.filter((product) => key(product.name) === key(row.name));
    if (matches.length !== 1) continue;
    const result = await tx.shoppingItem.updateMany({
      where: { id: row.id, householdId, status: "OPEN", productId: null },
      data: { productId: matches[0]!.id, ...shoppingProductDetails(matches[0]!, row) },
    });
    changed ||= result.count > 0;
  }
  return changed;
}

/** Stored records are requirements; all open requirements of one product form one buying position. */
async function positionRows(householdId: string, row: ItemRow, tx: Prisma.TransactionClient = db): Promise<ItemRow[]> {
  const repaired = await linkExactUnlinkedRows(householdId, tx);
  if (repaired && !row.productId) row = await tx.shoppingItem.findFirstOrThrow({ where: { id: row.id, householdId }, include: itemInclude });
  if (!row.productId || (row.status === "BOUGHT" && !row.boughtAt)) return [row];
  return tx.shoppingItem.findMany({
    where: { householdId, productId: row.productId, status: row.status, ...(row.status === "BOUGHT" && { boughtAt: row.boughtAt }) },
    include: itemInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function toPosition(householdId: string, row: ItemRow) {
  const [item] = await toItems(householdId, await positionRows(householdId, row));
  return item as ShoppingItem;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    unit: householdStockUnit(row.unit, row.stockProduct?.stockItems ?? row.stockItems),
    category: toCategory(row.category),
    isEssential: row.isEssential,
    defaultShopId: row.defaultShopId,
    barcode: row.barcode,
    qrCode: row.qrCode,
    imageUrl: row.imageUrl,
    notes: row.notes,
    packageAmount: row.packageAmount?.toNumber() ?? null,
    packageUnit: row.packageUnit,
    shopLinks: row.shopLinks
      .map((link) => ({
        id: link.id,
        shopId: link.shopId,
        shop: toShopRef(link.shop),
        url: link.url,
        priceCents: link.priceCents,
        articleNumber: link.articleNumber,
      }))
      .sort((a, b) => a.shop.name.localeCompare(b.shop.name)),
    stockProductId: row.stockProductId,
    alternatives: row.alternatives.map((alternative) => ({ id: alternative.id, name: alternative.name, imageUrl: alternative.imageUrl })),
  };
}

type StapleRow = Prisma.ShoppingStapleGetPayload<object>;

const toStaple = (row: StapleRow): ShoppingStaple => ({
  id: row.id,
  listId: row.listId,
  productId: row.productId,
  name: row.name,
  quantity: row.quantity.toNumber(),
  unit: row.unit,
  shopId: row.shopId,
  rrule: row.rrule,
  startDate: fromDate(row.startDate),
  nextDueOn: fromDate(row.nextDueOn),
});

// Ownership checks: ids from another household are a 404 (lists, products, places) or a validation error
// on the field (references inside a body).

async function findOwnItem(householdId: string, id: string) {
  const row = await db.shoppingItem.findFirst({ where: { id, householdId }, include: itemInclude });
  if (!row) throw notFound("Shopping item not found");
  return row;
}

async function findOwnList(householdId: string, id: string) {
  const row = await db.shoppingList.findFirst({ where: { id, householdId } });
  if (!row) throw notFound("Shopping list not found");
  return row;
}

async function findOwnProduct(householdId: string, id: string) {
  const row = await db.product.findFirst({ where: { id, householdId }, include: productInclude });
  if (!row) throw notFound("Product not found");
  return row;
}

const invalid = (field: string, message: string) => badRequest("Validation failed", { [field]: [message] });

async function assertRefs(
  householdId: string,
  refs: { listId?: string | null; productId?: string | null; shopId?: string | null; placeId?: string | null; projectId?: string | null },
) {
  const checks: Promise<void>[] = [];
  if (refs.projectId) {
    checks.push(
      db.project.count({ where: { id: refs.projectId, householdId } }).then((n) => {
        if (!n) throw invalid("projectId", "Unknown project");
      }),
    );
  }
  if (refs.listId) {
    checks.push(
      db.shoppingList.count({ where: { id: refs.listId, householdId } }).then((n) => {
        if (!n) throw invalid("listId", "Unknown list");
      }),
    );
  }
  if (refs.productId) {
    checks.push(
      db.product.count({ where: { id: refs.productId, householdId } }).then((n) => {
        if (!n) throw invalid("productId", "Unknown product");
      }),
    );
  }
  if (refs.shopId) {
    checks.push(
      db.shop.count({ where: { id: refs.shopId, OR: [{ householdId }, { householdId: null }] } }).then((n) => {
        if (!n) throw invalid("shopId", "Unknown shop");
      }),
    );
  }
  if (refs.placeId) {
    checks.push(
      db.place.count({ where: { id: refs.placeId, householdId } }).then((n) => {
        if (!n) throw invalid("placeId", "Unknown place");
      }),
    );
  }
  await Promise.all(checks);
}

// Default lists ------------------------------------------------------------------------------------------

const DEFAULT_LIST_NAMES: Record<ShoppingItemSource, Record<Locale, string>> = {
  manual: { en: "Groceries", nl: "Boodschappen" },
  staple: { en: "Weekly groceries", nl: "Wekelijkse boodschappen" },
  task: { en: "Materials for jobs", nl: "Materiaal voor klussen" },
  low_stock: { en: "Running low", nl: "Bijna op" },
  // Not used: ingredients for meals land on the everyday groceries list (`manual`), see `addRecipeItem`.
  recipe: { en: "Groceries", nl: "Boodschappen" },
};

/** The list items from `source` land on when none is chosen; created on first use. */
export async function getDefaultList(householdId: string, source: ShoppingItemSource, locale: Locale = "en") {
  const defaultSource = fromSource(source);
  return db.shoppingList.upsert({
    where: { householdId_defaultSource: { householdId, defaultSource } },
    create: {
      householdId,
      defaultSource,
      name: DEFAULT_LIST_NAMES[source][locale],
      kind: fromKind(DEFAULT_LIST_KIND[source]),
    },
    update: {},
  });
}

// Link previews ------------------------------------------------------------------------------------------

/** Title, image and price of a webshop page, plus the known shop it belongs to. Never throws. */
export async function getLinkPreview(householdId: string, url: string): Promise<LinkPreview> {
  const host = bareHost(url);
  const shops = host ? await listShops(householdId) : [];
  const shop = shopForUrl(url, shops);

  try {
    const page = await fetchPage(url);
    const metadata = parsePageMetadata(page.html, page.url);
    return {
      url,
      title: metadata.title ?? url.slice(0, 120),
      imageUrl: metadata.imageUrl,
      priceCents: metadata.priceCents,
      shopId: shop?.id ?? null,
      fetched: Boolean(metadata.title),
    };
  } catch (error) {
    if (!(error instanceof UnsafeUrlError) && process.env.NODE_ENV !== "production") {
      console.warn(`Link preview failed for ${url}:`, (error as Error).message);
    }
    return { url, title: url.slice(0, 120), imageUrl: null, priceCents: null, shopId: shop?.id ?? null, fetched: false };
  }
}

// Staples ------------------------------------------------------------------------------------------------

/**
 * Puts every staple whose `nextDueOn` has passed back on its list (once: not when an open item for that
 * staple is still there) and moves `nextDueOn` past today. Runs on read, like bill instances.
 */
async function topUpStaples(householdId: string) {
  const day = today();
  const due = await db.shoppingStaple.findMany({ where: { householdId, nextDueOn: { lte: toDate(day) } } });
  for (const staple of due) {
    let ownerId: string | null = null;
    const product = staple.productId ? await findOwnProduct(householdId, staple.productId) : null;
    if (product) {
      const owner = product.stockProductId ? await findOwnProduct(householdId, product.stockProductId) : product;
      if (owner.shoppingRestockState && owner.shoppingRestockState !== "ACTIVE") continue;
      ownerId = owner.id;
    }
    const rule = parseStapleRRule(staple.rrule);
    const details = product ? shoppingProductDetails(product, { unit: staple.unit, shopId: staple.shopId, url: null, imageUrl: null, priceCents: null }) : {};
    const next = rule ? nextStapleOccurrence(rule, fromDate(staple.startDate), day) : addDays(day, 7);
    const added = await db.$transaction(async (tx) => {
      if (ownerId && !(await automaticShoppingAllowed(tx, householdId, ownerId))) return;
      // Claim the staple first, so concurrent reads don't add it twice.
      const claimed = await tx.shoppingStaple.updateMany({
        where: { id: staple.id, nextDueOn: staple.nextDueOn },
        data: { nextDueOn: toDate(next) },
      });
      if (claimed.count === 0) return;
      const open = await tx.shoppingItem.count({ where: { stapleId: staple.id, status: "OPEN" } });
      if (open > 0) return;
      await tx.shoppingItem.create({
        data: {
          householdId,
          listId: staple.listId,
          productId: staple.productId,
          name: staple.name,
          quantity: staple.quantity,
          unit: staple.unit,
          shopId: staple.shopId,
          source: "STAPLE",
          stapleId: staple.id,
          ...details,
        },
      });
      return true;
    });
    if (added) publishShoppingChanged(householdId);
  }
}

function stapleData(input: StapleInput) {
  const rule = parseStapleRRule(input.rrule);
  if (!rule) throw invalid("rrule", "Unsupported repeat rule");
  const day = today();
  // Due today or later; a start date in the past continues from its next occurrence.
  const nextDueOn = input.startDate >= day ? input.startDate : nextStapleOccurrence(rule, input.startDate, addDays(day, -1));
  return {
    listId: input.listId,
    productId: input.productId || null,
    name: input.name,
    quantity: input.quantity,
    unit: input.unit || null,
    shopId: input.shopId || null,
    rrule: input.rrule,
    startDate: toDate(input.startDate),
    nextDueOn: toDate(nextDueOn),
  };
}

async function createStapleImpl(householdId: string, input: StapleInput): Promise<ShoppingStaple> {
  await assertRefs(householdId, input);
  return toStaple(await db.shoppingStaple.create({ data: { householdId, ...stapleData(input) } }));
}

async function updateStapleImpl(householdId: string, id: string, input: StapleInput): Promise<ShoppingStaple> {
  const found = await db.shoppingStaple.count({ where: { id, householdId } });
  if (!found) throw notFound("Staple not found");
  await assertRefs(householdId, input);
  return toStaple(await db.shoppingStaple.update({ where: { id }, data: stapleData(input) }));
}

async function deleteStapleImpl(householdId: string, id: string): Promise<void> {
  const { count } = await db.shoppingStaple.deleteMany({ where: { id, householdId } });
  if (!count) throw notFound("Staple not found");
}

// Overview -----------------------------------------------------------------------------------------------

/** Bought items stay visible this long, so a mistaken tick can be undone. */
const RECENTLY_BOUGHT_HOURS = 24;

export async function getShoppingOverview(householdId: string, locale: Locale = "en"): Promise<ShoppingOverview> {
  await topUpStaples(householdId);
  await linkExactUnlinkedRows(householdId);
  await topUpLowStock(householdId, locale);
  const since = new Date(Date.now() - RECENTLY_BOUGHT_HOURS * 3_600_000);
  const [lists, rows, staples] = await Promise.all([
    db.shoppingList.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    db.shoppingItem.findMany({
      where: { householdId, OR: [{ status: "OPEN" }, { status: "SKIPPED" }, { boughtAt: { gte: since } }] },
      include: itemInclude,
      orderBy: { createdAt: "asc" },
    }),
    db.shoppingStaple.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
  ]);
  const items = await toItems(householdId, rows);
  const openByList = new Map<string, number>();
  for (const item of items) if (item.status === "open") openByList.set(item.listId, (openByList.get(item.listId) ?? 0) + 1);
  return {
    lists: lists.map(
      (list): ShoppingList => ({
        id: list.id,
        name: list.name,
        kind: toKind(list.kind),
        defaultSource: list.defaultSource ? toSource(list.defaultSource) : null,
        openCount: openByList.get(list.id) ?? 0,
      }),
    ),
    items,
    staples: staples.map(toStaple),
  };
}

// Lists --------------------------------------------------------------------------------------------------

async function createListImpl(householdId: string, input: ShoppingListInput) {
  const row = await db.shoppingList.create({ data: { householdId, name: input.name, kind: fromKind(input.kind) } });
  return { id: row.id };
}

async function updateListImpl(householdId: string, id: string, input: ShoppingListInput) {
  await findOwnList(householdId, id);
  await db.shoppingList.update({ where: { id }, data: { name: input.name, kind: fromKind(input.kind) } });
  return { id };
}

/** Deletes a list with its items and staples. */
async function deleteListImpl(householdId: string, id: string): Promise<void> {
  await findOwnList(householdId, id);
  await db.shoppingList.delete({ where: { id } });
}

/** Pause only automatic needs for this stock group; explicit/recipe needs and minima remain intact. */
export async function suppressShoppingRestock(tx: Prisma.TransactionClient, householdId: string, ownerIds: string[], selectedIds: string[] = [], state: "RESTOCKED" | "DISMISSED" = "RESTOCKED") {
  if (!ownerIds.length) return;
  await tx.product.updateMany({ where: { householdId, id: { in: ownerIds } }, data: { shoppingRestockState: state } });
  await tx.shoppingItem.updateMany({ where: { householdId, source: "LOW_STOCK", status: "OPEN", id: { notIn: selectedIds }, product: { is: { OR: [{ id: { in: ownerIds } }, { stockProductId: { in: ownerIds } }] } } }, data: { status: "SKIPPED" } });
}

// Items --------------------------------------------------------------------------------------------------

export async function listItems(householdId: string, query: ShoppingItemQuery = {}, locale: Locale = "en"): Promise<ShoppingItem[]> {
  await linkExactUnlinkedRows(householdId);
  await topUpLowStock(householdId, locale);
  // A project's materials: its own items and those of its tasks (an item's own project wins).
  const projectTaskIds = query.projectId
    ? (await db.task.findMany({ where: { householdId, projectId: query.projectId }, select: { id: true } })).map((task) => task.id)
    : [];
  const rows = await db.shoppingItem.findMany({
    where: {
      householdId,
      ...(query.status && { status: query.status.toUpperCase() as "OPEN" | "BOUGHT" | "SKIPPED" }),
    },
    include: itemInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const items = await toItems(householdId, rows);
  return items.filter((item) => {
    const requirements = item.requirements ?? [item];
    return (!query.projectId || requirements.some((part) => part.project?.id === query.projectId || (!part.project && part.taskId && projectTaskIds.includes(part.taskId))))
      && (!query.taskId || requirements.some((part) => part.taskId === query.taskId))
      && (!query.listId || shoppingItemListIds(item).includes(query.listId))
      && (!query.placeId || requirements.some((part) => part.placeId === query.placeId))
      && (!query.shopId || item.shopId === (query.shopId === NO_SHOP ? null : query.shopId));
  });
}

async function createItemImpl(user: Pick<SessionUser, "id" | "householdId" | "locale">, input: ShoppingItemCreateInput) {
  const { householdId } = user;
  await assertRefs(householdId, input);
  const product = input.productId ? await findOwnProduct(householdId, input.productId) : null;
  // A pasted link is read for its price, photo and shop, also when the form sent its title as the name.
  const preview = input.url && !product ? await getLinkPreview(householdId, input.url) : null;
  const shopId = input.shopId ?? product?.defaultShopId ?? (product?.shopLinks.length === 1 ? product.shopLinks[0]!.shopId : null) ?? preview?.shopId ?? null;
  const link = product && shopId ? product.shopLinks.find((candidate) => candidate.shopId === shopId) : undefined;
  const listId = input.listId ?? (await getDefaultList(householdId, input.source, user.locale)).id;

  const row = await db.shoppingItem.create({
    data: {
      householdId,
      listId,
      productId: product?.id ?? null,
      name: input.name ?? product?.name ?? preview?.title ?? input.url ?? "",
      quantity: input.quantity ?? 1,
      unit: input.unit ?? (product ? householdStockUnit(product.unit, product.stockProduct?.stockItems ?? product.stockItems) : null),
      shopId,
      url: input.url ?? link?.url ?? null,
      imageUrl: preview?.imageUrl ?? product?.imageUrl ?? null,
      priceCents: input.priceCents ?? preview?.priceCents ?? link?.priceCents ?? null,
      note: input.note || null,
      placeId: input.placeId || null,
      source: fromSource(input.source),
      taskId: input.taskId || null,
      projectId: input.projectId || null,
      createdByUserId: user.id,
    },
    include: itemInclude,
  });
  return toPosition(householdId, row);
}

/**
 * Updates an item. Children may tick items off and change items they added themselves; anything else is
 * for adults and owners. `justBought` says the item went from open to bought in this call.
 */
async function updateItemImpl(user: SessionUser, id: string, input: ShoppingItemUpdateInput) {
  const { householdId } = user;
  const existing = await findOwnItem(householdId, id);
  const editsMoreThanStatus = Object.keys(input).some((key) => key !== "status" && key !== "purchaseDecision" && key !== "expectedUpdatedAt");
  if (user.role === "child" && editsMoreThanStatus && existing.createdByUserId !== user.id) {
    throw forbidden("Children can only tick items off");
  }
  await assertRefs(householdId, input);

  const linkedProduct = input.productId ? await findOwnProduct(householdId, input.productId)
    : input.shopId !== undefined && existing.productId ? await findOwnProduct(householdId, existing.productId) : null;
  let becomesBought = false;
  let becomesOpen = false;
  const boughtAt = new Date();
  const row = await db.$transaction(async (tx) => {
    await lockStock(tx, householdId);
    const current = await tx.shoppingItem.findFirst({ where: { id, householdId }, include: itemInclude });
    if (!current) throw notFound("Shopping item not found");
    if (input.expectedUpdatedAt && current.updatedAt.toISOString() !== input.expectedUpdatedAt && (editsMoreThanStatus || current.status.toLowerCase() !== input.status)) throw conflict("Someone changed this shopping item; refresh before editing it");
    const rows = await positionRows(householdId, current, tx);
    becomesBought = input.status === "bought" && rows.some((part) => part.status !== "BOUGHT");
    becomesOpen = input.status === "open" && rows.some((part) => part.status !== "OPEN");
    if (user.role === "child" && editsMoreThanStatus && rows.some((row) => row.createdByUserId !== user.id)) {
      throw forbidden("Children can only edit their own items");
    }
    const [position] = await toItems(householdId, rows);
    if (!position) throw notFound("Shopping item not found");
    const quantityChanged = input.quantity !== undefined && input.quantity !== position.quantity;
    const unitChanged = input.unit !== undefined && (input.unit || null) !== position.unit;
    if (rows.length > 1 && position.amounts && (quantityChanged || unitChanged)) {
      throw invalid("unit", "Set the product's package size so these amounts can be converted before changing their total");
    }
    const [unrounded] = quantityChanged || unitChanged ? await toItems(householdId, rows, false) : [position];
    const ratio = quantityChanged || unitChanged ? (input.quantity ?? position.quantity) / unrounded!.quantity : 1;
    const data: Prisma.ShoppingItemUncheckedUpdateInput = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.productId !== undefined && { productId: input.productId }),
      ...(unitChanged && { unit: input.unit || null }),
      ...(input.shopId !== undefined && { shopId: input.shopId }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.note !== undefined && { note: input.note || null }),
      ...(input.listId !== undefined && { listId: input.listId }),
      ...(input.placeId !== undefined && { placeId: input.placeId }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.category !== undefined && { category: input.category ? fromCategory(input.category) : null }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(becomesBought && { status: "BOUGHT", boughtAt, boughtByUserId: user.id }),
      ...(becomesOpen && { status: "OPEN", boughtAt: null, boughtByUserId: null }),
      ...(input.status === "skipped" && { status: "SKIPPED", boughtAt: null, boughtByUserId: null }),
    };
    let updated: ItemRow | undefined;
    for (const part of rows) {
      const quantity = unitChanged
        ? shoppingAmount(part.quantity.toNumber(), part.unit, position.unit, part.product ? {
          unit: householdStockUnit(part.product.unit, part.product.stockProduct?.stockItems ?? part.product.stockItems), packageAmount: part.product.packageAmount?.toNumber() ?? null, packageUnit: part.product.packageUnit,
        } : undefined)!
        : part.quantity.toNumber();
      const saved = await tx.shoppingItem.update({
        where: { id: part.id },
        data: {
          ...(linkedProduct && shoppingProductDetails(linkedProduct, part, input.shopId)),
          ...data,
          ...((quantityChanged || unitChanged) && { quantity: Math.round(quantity * ratio * 1000) / 1000 }),
        },
        include: itemInclude,
      });
      if (part.id === id) updated = saved;
    }
    if (!updated) throw notFound("Shopping item not found");
    if (input.status === "bought" || input.status === "skipped") {
      const owners = [...new Set(rows.flatMap((part) => part.productId ? [part.product?.stockProductId ?? part.productId] : []))];
      if (owners.length) await tx.product.updateMany({
        where: { householdId, id: { in: owners } }, data: { shoppingRestockState: input.status === "bought" ? "RESTOCKED" : "DISMISSED" },
      });
      if (rows.some((part) => part.product?.stockProductId || (part.product?._count.alternatives ?? 0) > 0)) await suppressShoppingRestock(tx, householdId, owners, rows.map((part) => part.id), input.status === "bought" ? "RESTOCKED" : "DISMISSED");
    }
    return updated;
  });
  return { item: await toPosition(householdId, row), justBought: becomesBought };
}

/** Marks every open item on the selected household shopping lists as bought in one operation. */
async function markOpenItemsBoughtImpl(user: SessionUser, listIds: string[]): Promise<number> {
  if (!listIds.length) return 0;
  const lists = await db.shoppingList.findMany({
    where: { householdId: user.householdId, id: { in: listIds } },
    select: { id: true },
  });
  if (lists.length !== new Set(listIds).size) throw badRequest("One or more shopping lists are no longer available.");

  const result = await db.$transaction(async (tx) => {
    await lockStock(tx, user.householdId);
    const open = await tx.shoppingItem.findMany({ where: { householdId: user.householdId, listId: { in: listIds }, status: "OPEN" }, select: { id: true, productId: true, product: { select: { stockProductId: true } } } });
    const result = await tx.shoppingItem.updateMany({
      where: { householdId: user.householdId, listId: { in: listIds }, status: "OPEN" },
      data: { status: "BOUGHT", boughtAt: new Date(), boughtByUserId: user.id },
    });
    await suppressShoppingRestock(tx, user.householdId, [...new Set(open.flatMap((row) => row.productId ? [row.product?.stockProductId ?? row.productId] : []))], open.map((row) => row.id));
    return result;
  });
  return result.count;
}

async function deleteItemImpl(user: SessionUser, id: string): Promise<void> {
  const existing = await findOwnItem(user.householdId, id);
  await db.$transaction(async (tx) => {
    const rows = await positionRows(user.householdId, existing, tx);
    if (user.role === "child" && rows.some((row) => row.createdByUserId !== user.id)) throw forbidden("Children can only delete their own items");
    const owners = [...new Set(rows.filter((row) => row.status === "OPEN" && row.productId).map((row) => row.product?.stockProductId ?? row.productId!))];
    if (owners.length) await tx.product.updateMany({
      where: { householdId: user.householdId, id: { in: owners } }, data: { shoppingRestockState: "DISMISSED" },
    });
    await tx.shoppingItem.deleteMany({ where: { householdId: user.householdId, id: { in: rows.map((row) => row.id) } } });
  });
}

/** Loads one item (for other services, e.g. restocking after it was bought). */
export async function getItem(householdId: string, id: string): Promise<ShoppingItem> {
  return toPosition(householdId, await findOwnItem(householdId, id));
}

/**
 * For the Tasks feature: per task id, how many shopping items it has and how many are bought. Tasks
 * without items are left out.
 */
export async function getMaterialStatusForTasks(
  householdId: string,
  taskIds: string[],
): Promise<Record<string, MaterialStatus>> {
  if (taskIds.length === 0) return {};
  const groups = await db.shoppingItem.groupBy({
    by: ["taskId", "status"],
    where: { householdId, taskId: { in: taskIds } },
    _count: { _all: true },
  });
  const result: Record<string, MaterialStatus> = {};
  for (const group of groups) {
    if (!group.taskId) continue;
    const status = (result[group.taskId] ??= { total: 0, bought: 0 });
    status.total += group._count._all;
    if (group.status === "BOUGHT") status.bought += group._count._all;
  }
  return result;
}

/** For the Tasks feature: deletes a task's items when the task is deleted (no FK). Returns how many. */
async function deleteItemsForTaskImpl(householdId: string, taskId: string): Promise<number> {
  const { count } = await db.shoppingItem.deleteMany({ where: { householdId, taskId } });
  return count;
}

/**
 * For Inventory: puts a product at or below its minimum on the "Running low" list for its default
 * shop, unless an open item for that product, or any product sharing its stock (alternatives), is already
 * on a list. Returns whether an item was added.
 */
async function ensureLowStockItemImpl(
  householdId: string,
  input: { productId: string; placeId: string | null; quantity: number; unit: string | null },
  locale: Locale = "en",
): Promise<boolean> {
  const product = await findOwnProduct(householdId, input.productId);
  const owner = product.stockProductId ? await findOwnProduct(householdId, product.stockProductId) : product;
  if (owner.shoppingRestockState && owner.shoppingRestockState !== "ACTIVE") return false;
  const group = await groupProductIds(householdId, owner.id);
  if (await db.shoppingItem.count({ where: { householdId, productId: { in: group }, status: "OPEN" } })) return false;
  const list = await getDefaultList(householdId, "low_stock", locale);
  const details = shoppingProductDetails(product, { unit: input.unit, shopId: null, url: null, imageUrl: null, priceCents: null });
  return db.$transaction(async (tx) => {
    // The product lock also serializes deletion: a stale background read cannot undo a dismissal.
    if (!(await automaticShoppingAllowed(tx, householdId, owner.id))) return false;
    const open = await tx.shoppingItem.count({ where: { householdId, productId: { in: group }, status: "OPEN" } });
    if (open > 0) return false;
    await tx.shoppingItem.create({
      data: {
        householdId,
        listId: list.id,
        productId: product.id,
        name: product.name,
        quantity: input.quantity > 0 ? input.quantity : 1,
        ...details,
        placeId: input.placeId,
        source: "LOW_STOCK",
      },
    });
    return true;
  });
}

async function automaticShoppingAllowed(tx: Prisma.TransactionClient, householdId: string, ownerId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ shoppingRestockState: string }[]>`
    SELECT "shoppingRestockState" FROM "products"
    WHERE "id" = ${ownerId} AND "householdId" = ${householdId} FOR UPDATE
  `;
  return rows[0]?.shoppingRestockState === "ACTIVE";
}

// Concurrent shopping reads share the same reconciliation so they cannot add the same stock twice.
const lowStockTopUps = new Map<string, Promise<void>>();

/**
 * An old LOW_STOCK row is not a permanent request to buy goods. When its
 * canonical shared-stock group has been replenished above its minimum, remove
 * only that automatic suggestion. Never touch manual, task or recipe items, and
 * don't dismiss the group's restock state: it must become buyable again when
 * the actual stock drops in the future.
 */
async function clearSatisfiedLowStock(householdId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockStock(tx, householdId);
    const suggestions = await tx.shoppingItem.findMany({
      where: { householdId, source: "LOW_STOCK", status: "OPEN", productId: { not: null } },
      select: { id: true, productId: true, product: { select: { stockProductId: true } } },
    });
    if (!suggestions.length) return;

    const owners = [...new Set(suggestions.map((item) => item.product?.stockProductId ?? item.productId!))];
    const stocks = await tx.stockItem.findMany({
      where: { householdId, productId: { in: owners } },
      select: { productId: true, quantity: true, minQuantity: true },
    });
    const byOwner = new Map<string, typeof stocks>();
    for (const row of stocks) {
      const grouped = byOwner.get(row.productId) ?? [];
      grouped.push(row);
      byOwner.set(row.productId, grouped);
    }
    const satisfied = suggestions.filter((item) => {
      const owner = item.product?.stockProductId ?? item.productId!;
      const group = byOwner.get(owner) ?? [];
      // Don't remove suggestions when no reliable stock/minimum is recorded.
      return group.some((row) => row.minQuantity !== null) &&
        group.every((row) => row.minQuantity === null || row.quantity.gt(row.minQuantity));
    });
    if (!satisfied.length) return;
    await tx.shoppingItem.deleteMany({
      where: { householdId, source: "LOW_STOCK", status: "OPEN", id: { in: satisfied.map((item) => item.id) } },
    });
    publishShoppingChanged(householdId);
  });
}

/** Reconciles existing low stock on read, even when its quantity hasn't changed. */
async function topUpLowStock(householdId: string, locale: Locale): Promise<void> {
  const pending = lowStockTopUps.get(householdId);
  if (pending) return pending;
  const run = (async () => {
    const rows = await db.stockItem.findMany({
      where: { householdId, quantity: { lte: db.stockItem.fields.minQuantity } },
      include: { product: { select: { unit: true } } },
      orderBy: { id: "asc" },
    });
    for (const row of rows) {
      if (row.minQuantity === null) continue;
      await ensureLowStockItem(householdId, {
        productId: row.productId,
        placeId: row.placeId,
        quantity: restockAmount(row.minQuantity.toNumber()),
        unit: row.unit ?? row.product.unit,
      }, locale);
    }
    await clearSatisfiedLowStock(householdId);
  })();
  lowStockTopUps.set(householdId, run);
  try {
    await run;
  } finally {
    lowStockTopUps.delete(householdId);
  }
}

/**
 * For Recipes: puts an ingredient of a meal on the "To cook" list on the shopping list (source `recipe`, on the
 * everyday groceries list: the default list for `manual`, so there is no second "Groceries"). Like `ensureLowStockItem`, an open item for the same product, or any product
 * sharing its stock, is reused as one buying position. Each meal retains its own requirement, so removing
 * it leaves other purchases intact. Free-text ingredients are still reused by name.
 */
async function addRecipeItemImpl(
  user: Pick<SessionUser, "id" | "householdId" | "locale">,
  input: { productId: string | null; name: string; quantity: number; unit: string | null; mealPlanEntryId: string; note?: string | null },
): Promise<{ itemId: string; merged: boolean }> {
  const { householdId } = user;
  const quantity = input.quantity > 0 ? input.quantity : 1;
  const product = input.productId ? await findOwnProduct(householdId, input.productId) : null;
  const group = product ? await groupProductIds(householdId, stockOwnerOf(product)) : [];
  const existing = await db.shoppingItem.findFirst({
    where: product
      ? { householdId, status: "OPEN", productId: { in: group } }
      : { householdId, status: "OPEN", productId: null, name: { equals: input.name.trim(), mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  if (existing && !product) {
    await db.shoppingItem.update({ where: { id: existing.id }, data: { quantity: { increment: quantity } } });
    return { itemId: existing.id, merged: true };
  }
  // The everyday groceries list, not a second "Groceries" list of its own.
  const list = await getDefaultList(householdId, "manual", user.locale);
  const details = product ? shoppingProductDetails(product, { unit: input.unit, shopId: null, url: null, imageUrl: null, priceCents: null }) : {};
  const row = await db.shoppingItem.create({
    data: {
      householdId,
      listId: list.id,
      productId: existing?.productId ?? product?.id ?? null,
      name: product?.name ?? input.name.trim(),
      quantity,
      unit: input.unit ?? (product ? householdStockUnit(product.unit, product.stockProduct?.stockItems ?? product.stockItems) : null),
      ...details,
      note: input.note || null,
      source: "RECIPE",
      mealPlanEntryId: input.mealPlanEntryId,
      createdByUserId: user.id,
    },
    include: itemInclude,
  });
  // A recipe requirement is independent of a minimum-stock target: 3 needed and a target of 1 means 3.
  // Keep the meal reference even when another meal or a manual purchase is already on the list.
  if (product) {
    const position = await toPosition(householdId, row);
    return { itemId: position.id, merged: Boolean(existing) };
  }
  return { itemId: row.id, merged: false };
}

/** For Recipes: the meal's open requirements, including those sharing a buying position. */
export async function countRecipeItems(householdId: string, mealPlanEntryId: string): Promise<number> {
  return db.shoppingItem.count({ where: { householdId, mealPlanEntryId, status: "OPEN" } });
}

/** For Recipes: removes a meal's open items when it leaves the "To cook" list (bought ones stay). Returns how many. */
async function deleteRecipeItemsImpl(householdId: string, mealPlanEntryId: string): Promise<number> {
  const { count } = await db.shoppingItem.deleteMany({ where: { householdId, mealPlanEntryId, status: "OPEN" } });
  return count;
}

// Products -----------------------------------------------------------------------------------------------

const productData = (input: ProductInput) => ({
  name: input.name,
  // Older integrations omit brand: keep the previous value on update rather than clearing it.
  ...(input.brand !== undefined && { brand: input.brand }),
  unit: input.unit || null,
  category: fromCategory(input.category),
  ...(input.isEssential !== undefined && { isEssential: input.isEssential }),
  defaultShopId: input.defaultShopId || null,
  barcode: input.barcode || null,
  qrCode: input.qrCode || null,
  imageUrl: input.imageUrl || null,
  notes: input.notes || null,
  packageAmount: input.packageAmount && input.packageUnit ? input.packageAmount : null,
  packageUnit: input.packageAmount && input.packageUnit ? input.packageUnit : null,
});

async function assertUniqueCodes(householdId: string, input: ProductInput, exceptId?: string) {
  for (const field of ["barcode", "qrCode"] as const) {
    const value = input[field];
    if (!value) continue;
    const clash = await db.product.findFirst({ where: { householdId, [field]: value, NOT: exceptId ? { id: exceptId } : undefined } });
    if (clash) throw invalid(field, `Already used by ${clash.name}`);
  }
}

export async function listProducts(householdId: string, query: ProductQuery = {}): Promise<Product[]> {
  if (query.shopId) await getShop(householdId, query.shopId);
  const conditions: Prisma.ProductWhereInput[] = [];
  if (query.q) conditions.push({ OR: [
    { name: { contains: query.q, mode: "insensitive" } },
    { brand: { contains: query.q, mode: "insensitive" } },
  ] });
  if (query.shopId) conditions.push({ OR: [
    { defaultShopId: query.shopId },
    { shopLinks: { some: { shopId: query.shopId } } },
  ] });
  const rows = await db.product.findMany({
    where: {
      householdId,
      ...(query.code && { OR: [{ barcode: query.code }, { qrCode: query.code }] }),
      // Keep scan, text and shop constraints together, including each constraint's OR.
      AND: conditions,
    },
    include: productInclude,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(toProduct);
}

export async function getProduct(householdId: string, id: string): Promise<Product> {
  return toProduct(await findOwnProduct(householdId, id));
}

export async function findProductByCode(householdId: string, code: string): Promise<Product | null> {
  const row = await db.product.findFirst({
    where: { householdId, OR: [{ barcode: code }, { qrCode: code }] },
    include: productInclude,
  });
  return row ? toProduct(row) : null;
}

async function createProductImpl(householdId: string, input: ProductInput): Promise<Product> {
  await assertRefs(householdId, { shopId: input.defaultShopId });
  await assertUniqueCodes(householdId, input);
  return toProduct(await db.product.create({ data: { householdId, ...productData(input) }, include: productInclude }));
}

async function updateProductImpl(householdId: string, id: string, input: ProductInput): Promise<Product> {
  await findOwnProduct(householdId, id);
  await assertRefs(householdId, { shopId: input.defaultShopId });
  await assertUniqueCodes(householdId, input, id);
  return toProduct(await db.product.update({ where: { id }, data: productData(input), include: productInclude }));
}

/** Deletes a product. A main product's oldest alternative takes over the group and its stock. */
async function deleteProductImpl(householdId: string, id: string): Promise<void> {
  await findOwnProduct(householdId, id);
  await db.$transaction(async (tx) => {
    const heir = promotionCandidate(
      await tx.product.findMany({ where: { householdId, stockProductId: id }, select: { id: true, name: true, createdAt: true } }),
    );
    if (heir) {
      await tx.product.update({ where: { id: heir.id }, data: { stockProductId: null } });
      await tx.product.updateMany({ where: { householdId, stockProductId: id }, data: { stockProductId: heir.id } });
      // The heir had no stock of its own (only main products do), so the items simply move over.
      await tx.stockItem.updateMany({ where: { householdId, productId: id }, data: { productId: heir.id } });
      await tx.stockPurchase.updateMany({ where: { householdId, productId: id }, data: { productId: heir.id } });
    }
    await tx.product.delete({ where: { id } });
  });
  await forgetEntity("product", id);
}

// Alternatives (shared stock, see product-alternatives.ts) -----------------------------------------------

/**
 * The product whose stock a product uses: its main product when it is an alternative, else itself. Another
 * household's product is a 404. For Inventory and Recipes: every stock read and change resolves through this.
 */
export async function stockOwnerId(householdId: string, productId: string): Promise<string> {
  const row = await db.product.findFirst({ where: { id: productId, householdId }, select: { id: true, stockProductId: true } });
  if (!row) throw notFound("Product not found");
  return stockOwnerOf(row);
}

/** Every product sharing the stock of main product `ownerId`: the owner first, then its alternatives by name. */
export async function groupProductIds(householdId: string, ownerId: string): Promise<string[]> {
  const alternatives = await db.product.findMany({
    where: { householdId, stockProductId: ownerId },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return [ownerId, ...alternatives.map((row) => row.id)];
}

type Actor = Pick<SessionUser, "id" | "householdId" | "locale">;

const mergeSelect = { id: true, placeId: true, quantity: true, unit: true, minQuantity: true, expiresOn: true, lastCountedAt: true } as const;
type MergeRow = Prisma.StockItemGetPayload<{ select: typeof mergeSelect }>;
const toMergeable = (row: MergeRow) => ({
  id: row.id,
  placeId: row.placeId,
  quantity: row.quantity.toNumber(),
  unit: row.unit,
  minQuantity: row.minQuantity?.toNumber() ?? null,
  expiresOn: row.expiresOn ? fromDate(row.expiresOn) : null,
});

/**
 * Makes `memberId` share the stock of main product `mainId`. An alternative simply changes group (its stock
 * stays with its old main product). A main product brings its alternatives along (no chains) and its stock
 * is merged into the main product's per place, with a "merged from" correction in the history.
 */
async function joinGroup(tx: Prisma.TransactionClient, actor: Actor, memberId: string, mainId: string) {
  const { householdId } = actor;
  for (const productId of [memberId, mainId].sort()) await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${householdId + ":product:" + productId}, 0))`;
  const member = await tx.product.findFirstOrThrow({ where: { id: memberId, householdId }, select: { name: true, stockProductId: true } });
  await tx.product.update({ where: { id: memberId }, data: { stockProductId: mainId } });
  if (member.stockProductId) return;
  await tx.product.updateMany({ where: { householdId, stockProductId: memberId }, data: { stockProductId: mainId } });

  const [source, target] = await Promise.all([
    tx.stockItem.findMany({ where: { householdId, productId: memberId }, select: mergeSelect }),
    tx.stockItem.findMany({ where: { householdId, productId: mainId }, select: mergeSelect }),
  ]);
  await tx.stockPurchase.updateMany({ where: { householdId, productId: memberId }, data: { productId: mainId } });
  const note = mergeNote(member.name, actor.locale);
  for (const step of planStockMerge(source.map(toMergeable), target.map(toMergeable))) {
    const log = { householdId, reason: "MANUAL_CORRECTION" as const, userId: actor.id, note };
    if (step.kind === "move") {
      await tx.stockItem.update({ where: { id: step.sourceId }, data: { productId: mainId } });
      await tx.stockMovement.create({ data: { ...log, stockItemId: step.sourceId, delta: 0, quantityAfter: step.quantity } });
      continue;
    }
    await tx.stockPurchase.updateMany({ where: { householdId, stockItemId: step.sourceId }, data: { stockItemId: step.targetId } });
    await tx.stockPurchaseEvidence.updateMany({ where: { householdId, stockItemId: step.sourceId }, data: { stockItemId: step.targetId } });
    await tx.stockMovement.updateMany({ where: { stockItemId: step.sourceId }, data: { stockItemId: step.targetId } });
    await tx.stockItem.update({
      where: { id: step.targetId },
      data: {
        quantity: step.quantity,
        // Conservatively review receipts before either confirmed count after the locations merge.
        lastCountedAt: [...source, ...target].filter((row) => row.id === step.sourceId || row.id === step.targetId).reduce<Date | null>((latest, row) => row.lastCountedAt && (!latest || row.lastCountedAt > latest) ? row.lastCountedAt : latest, null),
        unit: step.unit,
        minQuantity: step.minQuantity,
        expiresOn: step.expiresOn ? toDate(step.expiresOn) : null,
      },
    });
    await tx.stockMovement.create({ data: { ...log, stockItemId: step.targetId, delta: step.added, quantityAfter: step.quantity } });
    await tx.stockItem.delete({ where: { id: step.sourceId } });
  }
}

/**
 * Links `productId` as an alternative of `input.mainProductId` (of its main product, when that is an
 * alternative itself): they then share one stock. With `newMainName`, a new generic product (no barcode,
 * the chosen product's unit, category and shop) becomes the main product of both groups.
 */
async function linkAlternativeImpl(user: Actor, productId: string, input: ProductAlternativeInput): Promise<Product> {
  const { householdId } = user;
  const select = { id: true, name: true, stockProductId: true, unit: true, category: true, defaultShopId: true, packageAmount: true, packageUnit: true } as const;
  await db.$transaction(async (tx) => {
    await lockStock(tx, householdId);
    const [product, chosen] = await Promise.all([
      tx.product.findFirst({ where: { id: productId, householdId }, select }),
      tx.product.findFirst({ where: { id: input.mainProductId, householdId }, select }),
    ]);
    if (!product) throw notFound("Product not found");
    if (!chosen) throw invalid("mainProductId", "Unknown product");
    const problem = linkProblem(product, chosen);
    if (problem === "same_product") throw invalid("mainProductId", "Choose another product");
    if (problem === "already_linked") throw invalid("mainProductId", "These products already share stock");

    const sourceOwner = product.stockProductId ? await tx.product.findFirstOrThrow({ where: { id: product.stockProductId, householdId }, select }) : product;
    const chosenOwner = chosen.stockProductId ? await tx.product.findFirstOrThrow({ where: { id: chosen.stockProductId, householdId }, select }) : chosen;
    // A product may already share stock with several alternatives. Joining it
    // joins BOTH complete groups, so require explicit consent before modifying
    // all of their stock links. Existing product identities are never deleted.
    const [sourceGroupSize, chosenGroupSize] = await Promise.all([
      tx.product.count({ where: { householdId, OR: [{ id: sourceOwner.id }, { stockProductId: sourceOwner.id }] } }),
      tx.product.count({ where: { householdId, OR: [{ id: chosenOwner.id }, { stockProductId: chosenOwner.id }] } }),
    ]);
    if ((sourceGroupSize > 1 || chosenGroupSize > 1) && !input.confirmGroupMerge)
      throw invalid("confirmGroupMerge", "Confirm that all existing alternatives will share one stock");
    const compatibility = stockCompatibilityProblem({ ...sourceOwner, packageAmount: sourceOwner.packageAmount?.toNumber() }, { ...chosenOwner, packageAmount: chosenOwner.packageAmount?.toNumber() });
    if (compatibility) throw invalid("mainProductId", compatibility);
    let mainId = stockOwnerOf(chosen);
    if (input.newMainName) {
      const owner = await tx.product.findFirstOrThrow({ where: { id: mainId, householdId }, select });
      const main = await tx.product.create({
        data: { householdId, name: input.newMainName, unit: owner.unit, category: owner.category, defaultShopId: owner.defaultShopId, packageAmount: owner.packageAmount, packageUnit: owner.packageUnit },
      });
      await joinGroup(tx, user, owner.id, main.id);
      mainId = main.id;
    }
    // If the chosen variant already belongs to another shared-stock group,
    // link its OWNER, not just that variant. Moving only the variant would
    // strand its existing group stock (and its other alternatives). Joining
    // the owners preserves every product's identity and package information,
    // and combines their existing package counts exactly once.
    await joinGroup(tx, user, sourceOwner.id, mainId);
  });
  return getProduct(householdId, productId);
}

/** Takes an alternative out of its group. The shared stock stays with the main product. */
async function unlinkAlternativeImpl(householdId: string, productId: string): Promise<Product> {
  const product = await findOwnProduct(householdId, productId);
  if (!product.stockProductId) throw invalid("productId", "This product doesn't share another product's stock");
  await db.product.update({ where: { id: productId }, data: { stockProductId: null } });
  return getProduct(householdId, productId);
}

/** Adds or replaces the product's link for one shop. */
async function upsertProductLinkImpl(householdId: string, productId: string, input: ProductShopLinkInput): Promise<Product> {
  await findOwnProduct(householdId, productId);
  await assertRefs(householdId, { shopId: input.shopId });
  const data = { url: input.url || null, priceCents: input.priceCents ?? null, articleNumber: input.articleNumber || null };
  await db.productShopLink.upsert({
    where: { productId_shopId: { productId, shopId: input.shopId } },
    create: { productId, shopId: input.shopId, ...data },
    update: data,
  });
  return getProduct(householdId, productId);
}

async function deleteProductLinkImpl(householdId: string, productId: string, shopId: string): Promise<Product> {
  await findOwnProduct(householdId, productId);
  await db.productShopLink.deleteMany({ where: { productId, shopId } });
  return getProduct(householdId, productId);
}

// Shared mutation boundary for web, MCP, jobs and cross-feature callers.
export const createItem = withShoppingEvents(createItemImpl);
export const updateItem = withShoppingEvents(updateItemImpl);
export const deleteItem = withShoppingEvents(deleteItemImpl);
export const markOpenItemsBought = withShoppingEvents(markOpenItemsBoughtImpl);
export const createList = withShoppingEvents(createListImpl);
export const updateList = withShoppingEvents(updateListImpl);
export const deleteList = withShoppingEvents(deleteListImpl);
export const createStaple = withShoppingEvents(createStapleImpl);
export const updateStaple = withShoppingEvents(updateStapleImpl);
export const deleteStaple = withShoppingEvents(deleteStapleImpl);
export const createProduct = withShoppingEvents(createProductImpl);
export const updateProduct = withShoppingEvents(updateProductImpl);
export const deleteProduct = withShoppingEvents(deleteProductImpl);
export const linkAlternative = withShoppingEvents(linkAlternativeImpl);
export const unlinkAlternative = withShoppingEvents(unlinkAlternativeImpl);
export const upsertProductLink = withShoppingEvents(upsertProductLinkImpl);
export const deleteProductLink = withShoppingEvents(deleteProductLinkImpl);
export const addRecipeItem = withShoppingEvents(addRecipeItemImpl);
export const deleteRecipeItems = withShoppingEvents(deleteRecipeItemsImpl);
export const ensureLowStockItem = withShoppingEvents(ensureLowStockItemImpl);

export const deleteItemsForTask = withShoppingEvents(deleteItemsForTaskImpl);
