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
import type { Locale } from "@/types/common";
import { addDays, todayIn } from "@/types/dates";
import {
  db,
  type Prisma,
  type ProductCategory as ProductCategoryRow,
  type ShoppingItemSource as SourceRow,
  type ShoppingListKind as ListKindRow,
} from "../lib/db";
import { badRequest, forbidden, notFound } from "../lib/http";
import { forgetEntity } from "../selections/selections.service";
import { listShops, shopRefSelect, toShopRef } from "../shops/shops.service";
import { UnsafeUrlError, bareHost, fetchPage, parsePageMetadata } from "./link-preview";
import { linkProblem, mergeNote, planStockMerge, promotionCandidate, stockOwnerOf } from "./product-alternatives";

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

const shoppingStockSelect = { placeId: true, quantity: true, minQuantity: true } as const;

const itemInclude = {
  list: { select: { name: true } },
  shop: { select: shopRefSelect },
  place: { select: { name: true } },
  // The category, and whether the product shares stock with others (alternatives: "or: …" on the row).
  product: { select: {
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
    status: row.status === "BOUGHT" ? "bought" : "open",
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

async function toItems(householdId: string, rows: ItemRow[]) {
  const [names, groups, recipes] = await Promise.all([boughtByNames(householdId, rows), itemGroups(householdId, rows), itemRecipes(householdId, rows)]);
  return rows.map((row) => toItem(row, names, groups, recipes));
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
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
    const rule = parseStapleRRule(staple.rrule);
    const next = rule ? nextStapleOccurrence(rule, fromDate(staple.startDate), day) : addDays(day, 7);
    await db.$transaction(async (tx) => {
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
        },
      });
    });
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

export async function createStaple(householdId: string, input: StapleInput): Promise<ShoppingStaple> {
  await assertRefs(householdId, input);
  return toStaple(await db.shoppingStaple.create({ data: { householdId, ...stapleData(input) } }));
}

export async function updateStaple(householdId: string, id: string, input: StapleInput): Promise<ShoppingStaple> {
  const found = await db.shoppingStaple.count({ where: { id, householdId } });
  if (!found) throw notFound("Staple not found");
  await assertRefs(householdId, input);
  return toStaple(await db.shoppingStaple.update({ where: { id }, data: stapleData(input) }));
}

export async function deleteStaple(householdId: string, id: string): Promise<void> {
  const { count } = await db.shoppingStaple.deleteMany({ where: { id, householdId } });
  if (!count) throw notFound("Staple not found");
}

// Overview -----------------------------------------------------------------------------------------------

/** Bought items stay visible this long, so a mistaken tick can be undone. */
const RECENTLY_BOUGHT_HOURS = 24;

export async function getShoppingOverview(householdId: string, locale: Locale = "en"): Promise<ShoppingOverview> {
  await topUpStaples(householdId);
  await topUpLowStock(householdId, locale);
  const since = new Date(Date.now() - RECENTLY_BOUGHT_HOURS * 3_600_000);
  const [lists, counts, rows, staples] = await Promise.all([
    db.shoppingList.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    db.shoppingItem.groupBy({ by: ["listId"], where: { householdId, status: "OPEN" }, _count: { _all: true } }),
    db.shoppingItem.findMany({
      where: { householdId, OR: [{ status: "OPEN" }, { boughtAt: { gte: since } }] },
      include: itemInclude,
      orderBy: { createdAt: "asc" },
    }),
    db.shoppingStaple.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
  ]);
  const openByList = new Map(counts.map((count) => [count.listId, count._count._all]));
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
    items: await toItems(householdId, rows),
    staples: staples.map(toStaple),
  };
}

// Lists --------------------------------------------------------------------------------------------------

export async function createList(householdId: string, input: ShoppingListInput) {
  const row = await db.shoppingList.create({ data: { householdId, name: input.name, kind: fromKind(input.kind) } });
  return { id: row.id };
}

export async function updateList(householdId: string, id: string, input: ShoppingListInput) {
  await findOwnList(householdId, id);
  await db.shoppingList.update({ where: { id }, data: { name: input.name, kind: fromKind(input.kind) } });
  return { id };
}

/** Deletes a list with its items and staples. */
export async function deleteList(householdId: string, id: string): Promise<void> {
  await findOwnList(householdId, id);
  await db.shoppingList.delete({ where: { id } });
}

// Items --------------------------------------------------------------------------------------------------

export async function listItems(householdId: string, query: ShoppingItemQuery = {}, locale: Locale = "en"): Promise<ShoppingItem[]> {
  await topUpLowStock(householdId, locale);
  // A project's materials: its own items and those of its tasks (an item's own project wins).
  const projectTaskIds = query.projectId
    ? (await db.task.findMany({ where: { householdId, projectId: query.projectId }, select: { id: true } })).map((task) => task.id)
    : [];
  const rows = await db.shoppingItem.findMany({
    where: {
      householdId,
      ...(query.projectId && {
        OR: [{ projectId: query.projectId }, { projectId: null, taskId: { in: projectTaskIds } }],
      }),
      ...(query.taskId && { taskId: query.taskId }),
      ...(query.listId && { listId: query.listId }),
      ...(query.placeId && { placeId: query.placeId }),
      ...(query.shopId && { shopId: query.shopId === NO_SHOP ? null : query.shopId }),
      ...(query.status && { status: query.status === "bought" ? ("BOUGHT" as const) : ("OPEN" as const) }),
    },
    include: itemInclude,
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return toItems(householdId, rows);
}

export async function createItem(user: Pick<SessionUser, "id" | "householdId" | "locale">, input: ShoppingItemCreateInput) {
  const { householdId } = user;
  await assertRefs(householdId, input);
  const product = input.productId ? await findOwnProduct(householdId, input.productId) : null;
  // A pasted link is read for its price, photo and shop, also when the form sent its title as the name.
  const preview = input.url && !product ? await getLinkPreview(householdId, input.url) : null;
  const shopId = input.shopId ?? product?.defaultShopId ?? preview?.shopId ?? null;
  const link = product && shopId ? product.shopLinks.find((candidate) => candidate.shopId === shopId) : undefined;
  const listId = input.listId ?? (await getDefaultList(householdId, input.source, user.locale)).id;

  const row = await db.shoppingItem.create({
    data: {
      householdId,
      listId,
      productId: product?.id ?? null,
      name: input.name ?? product?.name ?? preview?.title ?? input.url ?? "",
      quantity: input.quantity ?? 1,
      unit: input.unit ?? product?.unit ?? null,
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
  const [item] = await toItems(householdId, [row]);
  return item as ShoppingItem;
}

/**
 * Updates an item. Children may tick items off and change items they added themselves; anything else is
 * for adults and owners. `justBought` says the item went from open to bought in this call.
 */
export async function updateItem(user: SessionUser, id: string, input: ShoppingItemUpdateInput) {
  const { householdId } = user;
  const existing = await findOwnItem(householdId, id);
  const editsMoreThanStatus = Object.keys(input).some((key) => key !== "status");
  if (user.role === "child" && editsMoreThanStatus && existing.createdByUserId !== user.id) {
    throw forbidden("Children can only tick items off");
  }
  await assertRefs(householdId, input);

  const becomesBought = input.status === "bought" && existing.status !== "BOUGHT";
  const becomesOpen = input.status === "open" && existing.status !== "OPEN";
  const row = await db.shoppingItem.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.productId !== undefined && { productId: input.productId }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unit !== undefined && { unit: input.unit || null }),
      ...(input.shopId !== undefined && { shopId: input.shopId }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.note !== undefined && { note: input.note || null }),
      ...(input.listId !== undefined && { listId: input.listId }),
      ...(input.placeId !== undefined && { placeId: input.placeId }),
      ...(input.projectId !== undefined && { projectId: input.projectId }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.category !== undefined && { category: input.category ? fromCategory(input.category) : null }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(becomesBought && { status: "BOUGHT", boughtAt: new Date(), boughtByUserId: user.id }),
      ...(becomesOpen && { status: "OPEN", boughtAt: null, boughtByUserId: null }),
    },
    include: itemInclude,
  });
  const [item] = await toItems(householdId, [row]);
  return { item: item as ShoppingItem, justBought: becomesBought };
}

export async function deleteItem(user: SessionUser, id: string): Promise<void> {
  const existing = await findOwnItem(user.householdId, id);
  if (user.role === "child" && existing.createdByUserId !== user.id) throw forbidden("Children can only delete their own items");
  await db.shoppingItem.delete({ where: { id } });
}

/** Loads one item (for other services, e.g. restocking after it was bought). */
export async function getItem(householdId: string, id: string): Promise<ShoppingItem> {
  const [item] = await toItems(householdId, [await findOwnItem(householdId, id)]);
  return item as ShoppingItem;
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
export async function deleteItemsForTask(householdId: string, taskId: string): Promise<number> {
  const { count } = await db.shoppingItem.deleteMany({ where: { householdId, taskId } });
  return count;
}

/**
 * For Inventory: puts a product at or below its minimum on the "Running low" list for its default
 * shop, unless an open item for that product, or any product sharing its stock (alternatives), is already
 * on a list. Returns whether an item was added.
 */
export async function ensureLowStockItem(
  householdId: string,
  input: { productId: string; placeId: string | null; quantity: number; unit: string | null },
  locale: Locale = "en",
): Promise<boolean> {
  const group = await groupProductIds(householdId, await stockOwnerId(householdId, input.productId));
  const open = await db.shoppingItem.count({ where: { householdId, productId: { in: group }, status: "OPEN" } });
  if (open > 0) return false;
  const product = await findOwnProduct(householdId, input.productId);
  const list = await getDefaultList(householdId, "low_stock", locale);
  const link = product.defaultShopId ? product.shopLinks.find((candidate) => candidate.shopId === product.defaultShopId) : undefined;
  await db.shoppingItem.create({
    data: {
      householdId,
      listId: list.id,
      productId: product.id,
      name: product.name,
      quantity: input.quantity > 0 ? input.quantity : 1,
      unit: input.unit ?? product.unit,
      shopId: product.defaultShopId,
      url: link?.url ?? null,
      priceCents: link?.priceCents ?? null,
      imageUrl: product.imageUrl,
      placeId: input.placeId,
      source: "LOW_STOCK",
    },
  });
  return true;
}

// Concurrent shopping reads share the same reconciliation so they cannot add the same stock twice.
const lowStockTopUps = new Map<string, Promise<void>>();

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
 * sharing its stock, is reused: its quantity goes up by `quantity` instead of adding a second line. An
 * ingredient without a product is a free-text item, reused by name. Returns the item and whether it was merged.
 */
export async function addRecipeItem(
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
  if (existing) {
    await db.shoppingItem.update({ where: { id: existing.id }, data: { quantity: { increment: quantity } } });
    return { itemId: existing.id, merged: true };
  }
  // The everyday groceries list, not a second "Groceries" list of its own.
  const list = await getDefaultList(householdId, "manual", user.locale);
  const link = product?.defaultShopId ? product.shopLinks.find((candidate) => candidate.shopId === product.defaultShopId) : undefined;
  const row = await db.shoppingItem.create({
    data: {
      householdId,
      listId: list.id,
      productId: product?.id ?? null,
      name: product?.name ?? input.name.trim(),
      quantity,
      unit: input.unit ?? product?.unit ?? null,
      shopId: product?.defaultShopId ?? null,
      url: link?.url ?? null,
      priceCents: link?.priceCents ?? null,
      imageUrl: product?.imageUrl ?? null,
      note: input.note || null,
      source: "RECIPE",
      mealPlanEntryId: input.mealPlanEntryId,
      createdByUserId: user.id,
    },
  });
  return { itemId: row.id, merged: false };
}

/** For Recipes: the open items added for a meal (not the ones merged into existing items). */
export async function countRecipeItems(householdId: string, mealPlanEntryId: string): Promise<number> {
  return db.shoppingItem.count({ where: { householdId, mealPlanEntryId, status: "OPEN" } });
}

/** For Recipes: removes a meal's open items when it leaves the "To cook" list (bought ones stay). Returns how many. */
export async function deleteRecipeItems(householdId: string, mealPlanEntryId: string): Promise<number> {
  const { count } = await db.shoppingItem.deleteMany({ where: { householdId, mealPlanEntryId, status: "OPEN" } });
  return count;
}

// Products -----------------------------------------------------------------------------------------------

const productData = (input: ProductInput) => ({
  name: input.name,
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
  const rows = await db.product.findMany({
    where: {
      householdId,
      ...(query.code && { OR: [{ barcode: query.code }, { qrCode: query.code }] }),
      ...(query.q && { name: { contains: query.q, mode: "insensitive" as const } }),
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

export async function createProduct(householdId: string, input: ProductInput): Promise<Product> {
  await assertRefs(householdId, { shopId: input.defaultShopId });
  await assertUniqueCodes(householdId, input);
  return toProduct(await db.product.create({ data: { householdId, ...productData(input) }, include: productInclude }));
}

export async function updateProduct(householdId: string, id: string, input: ProductInput): Promise<Product> {
  await findOwnProduct(householdId, id);
  await assertRefs(householdId, { shopId: input.defaultShopId });
  await assertUniqueCodes(householdId, input, id);
  return toProduct(await db.product.update({ where: { id }, data: productData(input), include: productInclude }));
}

/** Deletes a product. A main product's oldest alternative takes over the group and its stock. */
export async function deleteProduct(householdId: string, id: string): Promise<void> {
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

const mergeSelect = { id: true, placeId: true, quantity: true, unit: true, minQuantity: true, expiresOn: true } as const;
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
  const member = await tx.product.findFirstOrThrow({ where: { id: memberId, householdId }, select: { name: true, stockProductId: true } });
  await tx.product.update({ where: { id: memberId }, data: { stockProductId: mainId } });
  if (member.stockProductId) return;
  await tx.product.updateMany({ where: { householdId, stockProductId: memberId }, data: { stockProductId: mainId } });

  const [source, target] = await Promise.all([
    tx.stockItem.findMany({ where: { householdId, productId: memberId }, select: mergeSelect }),
    tx.stockItem.findMany({ where: { householdId, productId: mainId }, select: mergeSelect }),
  ]);
  const note = mergeNote(member.name, actor.locale);
  for (const step of planStockMerge(source.map(toMergeable), target.map(toMergeable))) {
    const log = { householdId, reason: "MANUAL_CORRECTION" as const, userId: actor.id, note };
    if (step.kind === "move") {
      await tx.stockItem.update({ where: { id: step.sourceId }, data: { productId: mainId } });
      await tx.stockMovement.create({ data: { ...log, stockItemId: step.sourceId, delta: 0, quantityAfter: step.quantity } });
      continue;
    }
    await tx.stockMovement.updateMany({ where: { stockItemId: step.sourceId }, data: { stockItemId: step.targetId } });
    await tx.stockItem.update({
      where: { id: step.targetId },
      data: {
        quantity: step.quantity,
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
export async function linkAlternative(user: Actor, productId: string, input: ProductAlternativeInput): Promise<Product> {
  const { householdId } = user;
  const select = { id: true, stockProductId: true, unit: true, category: true, defaultShopId: true } as const;
  const [product, chosen] = await Promise.all([
    db.product.findFirst({ where: { id: productId, householdId }, select }),
    db.product.findFirst({ where: { id: input.mainProductId, householdId }, select }),
  ]);
  if (!product) throw notFound("Product not found");
  if (!chosen) throw invalid("mainProductId", "Unknown product");
  const problem = linkProblem(product, chosen);
  if (problem === "same_product") throw invalid("mainProductId", "Choose another product");
  if (problem === "already_linked") throw invalid("mainProductId", "These products already share stock");

  await db.$transaction(async (tx) => {
    let mainId = stockOwnerOf(chosen);
    if (input.newMainName) {
      const owner = await tx.product.findFirstOrThrow({ where: { id: mainId, householdId }, select });
      const main = await tx.product.create({
        data: { householdId, name: input.newMainName, unit: owner.unit, category: owner.category, defaultShopId: owner.defaultShopId },
      });
      await joinGroup(tx, user, owner.id, main.id);
      mainId = main.id;
    }
    await joinGroup(tx, user, productId, mainId);
  });
  return getProduct(householdId, productId);
}

/** Takes an alternative out of its group. The shared stock stays with the main product. */
export async function unlinkAlternative(householdId: string, productId: string): Promise<Product> {
  const product = await findOwnProduct(householdId, productId);
  if (!product.stockProductId) throw invalid("productId", "This product doesn't share another product's stock");
  await db.product.update({ where: { id: productId }, data: { stockProductId: null } });
  return getProduct(householdId, productId);
}

/** Adds or replaces the product's link for one shop. */
export async function upsertProductLink(householdId: string, productId: string, input: ProductShopLinkInput): Promise<Product> {
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

export async function deleteProductLink(householdId: string, productId: string, shopId: string): Promise<Product> {
  await findOwnProduct(householdId, productId);
  await db.productShopLink.deleteMany({ where: { productId, shopId } });
  return getProduct(householdId, productId);
}
