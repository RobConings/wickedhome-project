import { updateShoppingItem } from "@/api/shopping/shopping-actions";
import { z } from "zod";
import { stockPurchaseInputSchema } from "@/features/inventory/types/purchases";
import { SHOPPING_LIST_KINDS, formatQuantity, type ShoppingItem } from "@/features/shopping/types/shopping";
import { shoppingListViews } from "@/features/shopping/types/shopping-list-views";
import { shoppingItemListIds, shoppingItemQuantity } from "@/features/shopping/types/shopping-product-rows";
import { formatStapleRRule } from "@/features/shopping/types/staple-recurrence";
import { todayIn } from "@/types/dates";
import { badRequest, forbidden } from "@/api/lib/http";
import {
  createItem,
  createList,
  createStaple,
  deleteItem,
  deleteList,
  deleteStaple,
  getDefaultList,
  getProduct,
  getShoppingOverview,
  listItems,
  markOpenItemsBought,
  listProducts,
  updateList,
  updateStaple,
} from "@/api/shopping/shopping.service";
import { listShops } from "@/api/shops/shops.service";
import {
  capList,
  day,
  done,
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
  type AssistantToolContext,
} from "@ai/core/kit";
import { scoreCandidates } from "@ai/core/resolve";
import { stockPriority } from "./stock-priority";
import { productSetup } from "../inventory/product-setup";

/** Skill "shopping": the shopping lists, staples and task materials (guide: guide.md next to this file). */

registerAssistantSkill({
  id: "shopping",
  title: { en: "Shopping", nl: "Boodschappen" },
  summary: "Shopping lists: essential or nice-to-have items, below-minimum buying needs and at-minimum warnings; the person chooses what to buy. Add, tick off, move, remove; recurring staples and materials.",
  keywords: {
    nl: ["boodschap", "boodschappen", "boodschappenlijst", "kopen", "halen", "op de lijst", "supermarkt", "delhaize", "colruyt", "aldi", "lidl", "nodig", "gekocht", "vaste boodschap", "lijstje"],
    en: ["shopping", "shopping list", "groceries", "buy", "on the list", "supermarket", "we need", "bought", "staple", "grocery list"],
  },
});

const LIST_LIMIT = 40;

const qty = (item: Pick<ShoppingItem, "quantity" | "unit" | "amounts">, locale: "en" | "nl") =>
  item.amounts || item.quantity !== 1 || item.unit ? shoppingItemQuantity(item, locale) : null;

/** "Delhaize 3 · Colruyt 2 · no shop 1": open items per shop, most first, no shop last. */
export function shopSummary(items: Pick<ShoppingItem, "shopId" | "shop">[]): string | null {
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    const key = item.shopId ?? "";
    const entry = counts.get(key) ?? { name: item.shop?.name ?? "no shop", count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .sort(([a, x], [b, y]) => Number(a === "") - Number(b === "") || y.count - x.count || x.name.localeCompare(y.name))
    .map(([, entry]) => `${entry.name} ${entry.count}`)
    .join(" · ");
}

registerEntityResolver({
  type: "shop",
  label: "shop",
  skill: "shopping",
  list: async (ctx) => (await listShops(ctx.householdId)).map((shop) => ({ id: shop.id, name: shop.name, hint: shop.type })),
});

registerEntityResolver({
  type: "shopping_list",
  label: "shopping list",
  skill: "shopping",
  list: async (ctx) => (await getShoppingOverview(ctx.householdId)).lists.map((list) => ({ id: list.id, name: list.name, aliases: [list.kind], hint: list.kind })),
});

registerEntityResolver({
  type: "shopping_item",
  label: "shopping list item",
  skill: "shopping",
  searchable: false,
  // Keep every recent id addressable, including bought recipe rows with an open namesake.
  list: async (ctx) => {
    const { items } = await getShoppingOverview(ctx.householdId);
    const open = items.filter((item) => item.status === "open");
    const bought = items.filter((item) => item.status === "bought");
    const openNames = new Set(open.map((item) => item.name.trim().toLocaleLowerCase(ctx.locale)));
    return [...open, ...bought].map((item) => ({
      id: item.id,
      name: item.status === "bought" && openNames.has(item.name.trim().toLocaleLowerCase(ctx.locale))
        ? `${item.name} (${say(ctx.locale, "bought", "gekocht")})` : item.name,
      hint: [item.status === "bought" ? "bought" : null, item.shop?.name, item.listName].filter(Boolean).join(", ") || undefined,
      data: { status: item.status },
    }));
  },
});

registerEntityResolver({
  type: "staple",
  label: "recurring shopping item (staple)",
  skill: "shopping",
  searchable: false,
  list: async (ctx) => (await getShoppingOverview(ctx.householdId)).staples.map((staple) => ({ id: staple.id, name: staple.name, hint: staple.rrule })),
});

const noChildren = (ctx: AssistantToolContext, what: string) => {
  if (ctx.user.role === "child") throw forbidden(`Only adults manage ${what}`);
};

/** Missing product links must be deliberate; a model must not silently bypass the catalogue. */
async function checkProductLink(ctx: AssistantToolContext, input: { name: string; product?: unknown; unlinkedReason?: string }) {
  if (input.product) return;
  const products = await listProducts(ctx.householdId);
  const candidates = scoreCandidates(input.name, products).slice(0, 5);
  if (candidates.length) {
    throw badRequest(`Possible catalogue products for "${input.name}": ${candidates.map(({ candidate }) => candidate.name).join(", ")}. Check inventory_products and inventory_stock, then call shopping_add_item with product. Resolve relevant alternatives instead of adding unlinked text.`);
  }
  if (!input.unlinkedReason) {
    throw badRequest(`No catalogue product found for "${input.name}". Search inventory_products for relevant names or alternatives, then create a missing product with inventory_save_product and pass product to shopping_add_item. Only for a genuine one-off without a suitable product, supply unlinkedReason explaining the exception.`);
  }
}

registerAssistantTool({
  name: "shopping.list",
  description:
    "One open buying row per catalogue product, across lists and sources. requirements retains all meal/task/manual/stock reasons; replenishment targets are not added on top of recipe needs. Updates, ticks and removal affect the complete row by id. amountNeedsReview means incompatible amounts remain explicit: do not invent a conversion. Combine stores with shops or shopGroup (shops_groups lists groups). Use q to search. stockStatus/buyingAdvice: below_minimum = to_buy; at_minimum = warning. Essential/nice_to_have is separate. Filter by shop, list, task, stockStatus or isEssential; bought shows recent purchases.",
  input: z.object({
    q: z.string().trim().min(1).max(120).optional().describe("Part of the item name; use to retrieve all copies of a suspected duplicate, including their unique ids"),
    shop: entityRef("shop", "Only items for this shop").optional(),
    shops: z.array(entityRef("shop")).min(1).max(50).optional().describe("Combine shops for one trip, e.g. Colruyt, Collect&Go and OKay. Items appear once; their original shop and price are retained"),
    shopGroup: entityRef("shop_group", "Saved household shop group (shops_groups lists them); combine all its members").optional(),
    list: entityRef("shopping_list", "List view; default groceries includes automatic replenishments. Stock level is a separate stockStatus filter").optional(),
    task: entityRef("task", "The materials of this task").optional(),
    bought: z.boolean().optional().describe("Show what was ticked off in the last day (a question). 'Ik heb X gekocht' is shopping_update_item bought true"),
    isEssential: z.boolean().optional().describe("Optional read filter: true for essentials, false for nice-to-haves; omitted returns both"),
    stockStatus: z.enum(["below_minimum", "at_minimum", "above_minimum"]).optional().describe("Optional read filter: below minimum needs buying; at minimum is a warning"),
  }),
  permission: "read",
  confirm: "never",
  core: true,
  activity: { en: "Checked the shopping list", nl: "Boodschappenlijst bekeken" },
  run: async (ctx, input) => {
    const overview = await getShoppingOverview(ctx.householdId, ctx.locale);
    const views = shoppingListViews(overview.lists, say(ctx.locale, "Groceries", "Boodschappen"));
    const selectedListIds = input.list ? views.find((view) => view.listIds.includes(input.list!.id))?.listIds ?? [input.list.id] : null;
    const viewNameByList = new Map(views.flatMap((view) => view.listIds.map((id) => [id, view.name] as const)));
    const status = input.bought ? "bought" : "open";
    const source = input.task ? await listItems(ctx.householdId, { taskId: input.task.id }, ctx.locale) : overview.items;
    const groupIds = (input.shopGroup?.data?.shopIds ?? []) as string[];
    const shopIds = new Set([...(input.shop ? [input.shop.id] : []), ...(input.shops ?? []).map((shop) => shop.id), ...groupIds]);
    const hasShopFilter = Boolean(input.shop || input.shops?.length || input.shopGroup);
    const items = source.filter(
      (item) =>
        (input.task || item.status === status) &&
        (!input.q || item.name.toLocaleLowerCase(ctx.locale).includes(input.q.toLocaleLowerCase(ctx.locale))) &&
        (!hasShopFilter || (item.shopId !== null && shopIds.has(item.shopId))) &&
        (!selectedListIds || shoppingItemListIds(item).some((id) => selectedListIds.includes(id))) &&
        (input.isEssential === undefined || item.isEssential === input.isEssential) &&
        (!input.stockStatus || item.stockStatus === input.stockStatus),
    );
    const open = overview.items.filter((item) => item.status === "open");
    const manyLists = views.length > 1;
    return {
      open: open.length,
      perShop: input.shop || input.task ? null : shopSummary(items),
      lists: manyLists && !input.list ? views.map((list) => `${list.name} (${list.openCount})`) : null,
      ...capList(items, LIST_LIMIT, (item) => ({
        id: item.id,
        name: item.name,
        productId: item.productId,
        linkedToProduct: Boolean(item.productId),
        source: item.source,
        taskId: item.taskId,
        project: item.project,
        recipe: item.recipe,
        requirements: item.requirements?.map((part) => ({ source: part.source, qty: qty(part, ctx.locale), taskId: part.taskId, project: part.project, recipe: part.recipe, listId: part.listId })),
        amountNeedsReview: item.amounts ? true : undefined,
        qty: qty(item, ctx.locale),
        listId: item.listId,
        shopId: item.shopId,
        list: manyLists && !input.list ? viewNameByList.get(item.listId) ?? item.listName : null,
        shop: input.shop ? null : item.shop?.name,
        note: item.note,
        price: money(item.priceCents),
        lowStock: item.stockStatus === "below_minimum" || item.stockStatus === "at_minimum" || null,
        ...stockPriority(item.stockStatus, item.isEssential, item.status === "bought"),
        bought: input.task && item.status === "bought" ? true : null,
        boughtBy: input.bought ? item.boughtByName : null,
      })),
    };
  },
});

registerAssistantTool({
  name: "shopping.add_item",
  description: "Add a product to groceries. First inventory_prepare_product/inventory_products: reuse relevant products and proactively fill available photo, shop, link and package facts; ask about important uncertainty and disclose gaps. Check inventory_stock and shopping_list to avoid duplicates. Pass product to preserve shared stock, shop links and importance; create missing products with inventory_save_product first. Unlinked one-offs require unlinkedReason and no matching product. For recipe shortages use recipes_plan. With task, links its material.",
  input: z.object({
    name: z.string().trim().min(1).max(120).describe("What to buy, e.g. 'melk'"),
    product: entityRef("product", "Existing catalogue product: look up relevant products/alternatives first; create with inventory_save_product if missing").optional(),
    unlinkedReason: z.string().trim().min(1).max(200).optional().describe("Explicit exception for a genuine one-off without a suitable catalogue product; explain why no product should be linked. Never use to bypass an existing/relevant product"),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().max(20).optional().describe("e.g. 'kg', 'pak'"),
    shop: entityRef("shop", "Shop to buy it at, e.g. 'Delhaize'").optional(),
    list: entityRef("shopping_list", "Another list than the default one").optional(),
    task: entityRef("task", "The task it is material for").optional(),
    note: z.string().trim().max(200).optional(),
    url: z.url({ protocol: /^https?$/ }).max(1000).optional().describe("Webshop link"),
    price: eurosSchema.optional().describe("Price per unit in euros"),
  }),
  permission: "write",
  // Harmless: the person may tick "don't ask again".
  confirm: "first-time",
  // Children may add to the shopping list, as in the app.
  roles: ["owner", "adult", "child"],
  activity: { en: "Added to the shopping list", nl: "Op de boodschappenlijst gezet" },
  describe: (ctx, input) => {
    const amount = input.quantity && (input.quantity !== 1 || input.unit) ? `${formatQuantity(input.quantity, ctx.locale)}${input.unit ? ` ${input.unit}` : " ×"} ` : "";
    const where = [input.shop?.name, input.task && say(ctx.locale, `for “${input.task.name}”`, `voor “${input.task.name}”`)].filter(Boolean).join(", ");
    const list = input.list?.name ?? say(ctx.locale, "the shopping list", "de boodschappenlijst");
    const exception = !input.product && input.unlinkedReason ? say(ctx.locale, ` (without a catalogue product: ${input.unlinkedReason})`, ` (zonder catalogusproduct: ${input.unlinkedReason})`) : "";
    return say(ctx.locale, `Put ${amount}${input.name}${where ? ` (${where})` : ""} on ${list}${exception}`, `${amount}${input.name}${where ? ` (${where})` : ""} op ${list} zetten${exception}`);
  },
  preview: async (ctx, input) => {
    await checkProductLink(ctx, input);
    return null;
  },
  run: async (ctx, input) => {
    await checkProductLink(ctx, input);
    const setup = input.product ? productSetup(await getProduct(ctx.householdId, input.product.id)) : null;
    const item = await createItem(ctx.user, {
      name: input.name,
      productId: input.product?.id ?? null,
      quantity: input.quantity,
      unit: input.unit ?? null,
      shopId: input.shop?.id ?? null,
      listId: input.list?.id ?? null,
      note: input.note ?? null,
      url: input.url ?? null,
      priceCents: input.price !== undefined ? toCents(input.price) : null,
      source: input.task ? "task" : "manual",
      taskId: input.task?.id ?? null,
    });
    return done(`${item.name} is on the list “${item.listName}”${item.shop ? ` (${item.shop.name})` : ""}.`, {
      id: item.id,
      product: input.product?.name ?? null,
      productSetup: setup,
      quantity: qty(item, ctx.locale),
      combinedRequirements: item.requirements?.length ?? 1,
      unlinkedReason: input.product ? undefined : input.unlinkedReason,
      ...stockPriority(item.stockStatus, item.isEssential),
    });
  },
});

registerAssistantTool({
  name: "shopping.complete_trip",
  description: "After a shopping trip, mark all currently open items on one named list, or on all grocery lists, as bought in one confirmed action. This only checks off list items; use inventory.record_purchase to add known quantities to stock and expenses.log to record the total paid.",
  input: z.object({
    list: entityRef("shopping_list", "Only this list; omit to complete all grocery lists").optional(),
  }),
  permission: "write",
  confirm: "always",
  roles: ["owner", "adult"],
  activity: { en: "Completed a shopping trip", nl: "Boodschappentrip afgerond" },
  describe: (ctx, input) => input.list
    ? say(ctx.locale, `Mark all open items on “${input.list.name}” as bought`, `Alle open items op “${input.list.name}” als gekocht afvinken`)
    : say(ctx.locale, "Mark all open grocery-list items as bought", "Alle open items op de boodschappenlijsten als gekocht afvinken"),
  run: async (ctx, input) => {
    const overview = await getShoppingOverview(ctx.householdId, ctx.locale);
    const lists = input.list
      ? overview.lists.filter((list) => list.id === input.list?.id)
      : overview.lists.filter((list) => list.kind === "groceries");
    if (input.list && !lists.length) throw badRequest("That shopping list is no longer available.");
    const count = await markOpenItemsBought(ctx.user, lists.map((list) => list.id));
    return done(
      count
        ? `Marked ${count} shopping-list ${count === 1 ? "item" : "items"} as bought.`
        : "There were no open items to mark as bought.",
      { markedBought: count },
    );
  },
});

registerAssistantTool({
  name: "shopping.update_item",
  description: "Update an existing shopping position by its id from shopping_list; duplicate names never require deleting/recreating recipe rows. Link product to fill missing shop/photo/URL/price while preserving original ingredient quantities, units and meal references. Passing product again also enriches an already-linked row. Never claim availability without a verified retailer link. Buying credits a known stock location exactly once; retries and later receipt evidence reuse the acquisition.",
  input: z.object({
    item: entityRef("shopping_item", "Unique row id from shopping_list (preferred for duplicate names), or an unambiguous item name"),
    product: entityRef("product", "Link this catalogue product to the existing item; use to repair unlinked groceries").optional(),
    bought: z.boolean().optional().describe("true = ticked off (bought), false = back on the list"),
    shop: entityRef("shop", "Move to this shop").optional(),
    noShop: z.boolean().optional().describe("Remove the shop"),
    list: entityRef("shopping_list", "Move to this list").optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().max(20).optional(),
    note: z.string().trim().max(500).optional(),
    purchaseDecision: stockPurchaseInputSchema.pick({ existingPurchaseIds: true, separatePurchaseConfirmed: true, countDisposition: true }).optional().describe("Only after asking the person: same purchase or extra; already included in a stock count. Retry a purchase_review with this decision."),
    addToStock: z.boolean().optional().describe("Compatibility flag. Bought items with a known stock location/unit are now restocked automatically and exactly once."),
  }),
  permission: "write",
  confirm: "first-time",
  // Children tick items off (and edit their own items); the service checks it.
  roles: ["owner", "adult", "child"],
  activity: { en: "Updated the shopping list", nl: "Boodschappenlijst bijgewerkt" },
  describe: (ctx, input) => {
    const name = `“${input.item.name}”`;
    if (input.bought === true) return say(ctx.locale, `Tick off ${name} as bought${input.addToStock ? " and add it to the stock" : ""}`, `${name} afvinken als gekocht${input.addToStock ? " en in de voorraad zetten" : ""}`);
    if (input.bought === false) return say(ctx.locale, `Put ${name} back on the list`, `${name} terug op de lijst zetten`);
    const changes = [
      input.product && say(ctx.locale, `link product ${input.product.name}`, `product ${input.product.name} koppelen`),
      input.shop && say(ctx.locale, `to ${input.shop.name}`, `naar ${input.shop.name}`),
      input.noShop && say(ctx.locale, "no shop", "geen winkel"),
      input.list && say(ctx.locale, `to the list ${input.list.name}`, `naar de lijst ${input.list.name}`),
      input.name && `“${input.name}”`,
      input.quantity && `${formatQuantity(input.quantity, ctx.locale)}${input.unit ? ` ${input.unit}` : ""}`,
      input.note && input.note,
    ].filter(Boolean);
    return say(ctx.locale, `Change ${name}: ${changes.join(", ")}`, `${name} aanpassen: ${changes.join(", ")}`);
  },
  run: async (ctx, input) => {
    const { item, restock, stock } = await updateShoppingItem(ctx.user, input.item.id, {
      purchaseDecision: input.purchaseDecision,
      ...(input.product && { productId: input.product.id }),
      ...(input.bought !== undefined && { status: input.bought ? ("bought" as const) : ("open" as const) }),
      ...(input.shop && { shopId: input.shop.id }),
      ...(input.noShop && { shopId: null }),
      ...(input.list && { listId: input.list.id }),
      ...(input.name && { name: input.name }),
      ...(input.quantity && { quantity: input.quantity }),
      ...(input.unit !== undefined && { unit: input.unit || null }),
      ...(input.note !== undefined && { note: input.note || null }),
    });
    const hint = stock
      ? ` Stock added: ${stock.added} in ${restock!.placeName}; purchase ids: ${stock.purchaseIds.join(", ")}. Later scans/receipts must link these goods, not add them again.`
      : item.status === "bought" ? "No stock added: verify its stock location and unit." : "Stock is unchanged when unticking.";
    const state = item.status === "bought" ? `Ticked off ${item.name}.` : `${item.name} is on “${item.listName}”${item.shop ? ` (${item.shop.name})` : ""}.`;
    return done(`${state}${hint}`, {
      purchase: stock, id: item.id, productId: item.productId, quantity: qty(item, ctx.locale), shopId: item.shopId,
      shop: item.shop?.name ?? null, url: item.url, imageUrl: item.imageUrl,
      amountNeedsReview: Boolean(item.amounts), requirements: item.requirements,
    });
  },
});

registerAssistantTool({
  name: "shopping.remove",
  description: "Delete a complete shopping position, an entire list (including its items/staples), or a recurring staple. Give exactly one of item, list, staple. Removing an open linked product pauses automatic low-stock and staple additions until its shared stock has genuinely increased and then decreased again. Explicit manual/recipe additions remain possible. Use the position's id from shopping_list. Removing groceries does not delete catalogue products or stock.",
  input: z.object({
    item: entityRef("shopping_item", "Unique row id from shopping_list, or an unambiguous name. Duplicate names: pass the id of only the row to remove").optional(),
    list: entityRef("shopping_list").optional(),
    staple: entityRef("staple").optional(),
  }),
  permission: "sensitive",
  confirm: "always",
  // Children may remove items they added themselves (the service checks it); lists and staples are for adults.
  roles: ["owner", "adult", "child"],
  refuse: (ctx, input) => (ctx.user.role === "child" && (input.list || input.staple) ? "Only adults delete shopping lists or recurring items; children can remove items they added themselves." : null),
  activity: { en: "Removed from the shopping lists", nl: "Van de boodschappenlijsten verwijderd" },
  describe: (ctx, input) => {
    if (input.list) return say(ctx.locale, `Delete the list “${input.list.name}” with its items`, `De lijst “${input.list.name}” met haar items verwijderen`);
    if (input.staple) return say(ctx.locale, `Stop the recurring item “${input.staple.name}”`, `Vaste boodschap “${input.staple.name}” stopzetten`);
    return say(ctx.locale, `Remove “${input.item?.name ?? "?"}” from the list`, `“${input.item?.name ?? "?"}” van de lijst halen`);
  },
  preview: async (ctx, input) => {
    if (!input.list) return null;
    const items = (await getShoppingOverview(ctx.householdId)).items.filter((item) => item.listId === input.list?.id && item.status === "open");
    return {
      kind: "list",
      title: say(ctx.locale, `${items.length} open items go too`, `${items.length} open items verdwijnen mee`),
      data: { items: items.slice(0, 15).map((item) => ({ label: item.name, detail: qty(item, ctx.locale) ?? undefined, tone: "remove" as const })) },
    };
  },
  run: async (ctx, input) => {
    const given = [input.item, input.list, input.staple].filter(Boolean).length;
    if (given !== 1) throw badRequest("Give exactly one of item, list or staple");
    if (input.list) {
      noChildren(ctx, "lists");
      await deleteList(ctx.householdId, input.list.id);
      return done(`Deleted the list “${input.list.name}”.`);
    }
    if (input.staple) {
      noChildren(ctx, "staples");
      await deleteStaple(ctx.householdId, input.staple.id);
      return done(`“${input.staple.name}” no longer comes back on the list.`);
    }
    const item = input.item;
    if (!item) throw badRequest("Which item?");
    await deleteItem(ctx.user, item.id);
    return done(`Removed ${item.name} from the list.`);
  },
});

registerAssistantTool({
  name: "shopping.save_list",
  description: "Create a shopping list, or rename / change the kind of an existing one.",
  input: z.object({
    list: entityRef("shopping_list", "The list to change; leave out to create one").optional(),
    name: z.string().trim().min(1).max(60),
    kind: z.enum(SHOPPING_LIST_KINDS).optional().describe("Default groceries"),
  }),
  permission: "write",
  confirm: "first-time",
  activity: { en: "Saved a shopping list", nl: "Boodschappenlijst bewaard" },
  describe: (ctx, input) =>
    input.list
      ? say(ctx.locale, `Rename the list “${input.list.name}” to “${input.name}”`, `Lijst “${input.list.name}” hernoemen naar “${input.name}”`)
      : say(ctx.locale, `Create the shopping list “${input.name}”`, `Boodschappenlijst “${input.name}” aanmaken`),
  run: async (ctx, input) => {
    if (input.list) {
      const current = (await getShoppingOverview(ctx.householdId)).lists.find((list) => list.id === input.list?.id);
      await updateList(ctx.householdId, input.list.id, { name: input.name, kind: input.kind ?? current?.kind ?? "groceries" });
      return done(`The list is now called “${input.name}”.`);
    }
    const { id } = await createList(ctx.householdId, { name: input.name, kind: input.kind ?? "groceries" });
    return done(`Created the list “${input.name}”.`, { id });
  },
});

const FREQ = { day: "DAILY", week: "WEEKLY", month: "MONTHLY" } as const;

registerAssistantTool({
  name: "shopping.save_staple",
  description: "A recurring shopping item (staple) that comes back on the list by itself, e.g. milk every week; or change one.",
  input: z.object({
    staple: entityRef("staple", "The staple to change; leave out to create one").optional(),
    name: z.string().trim().min(1).max(120),
    every: z.number().int().min(1).max(52).default(1),
    unit: z.enum(["day", "week", "month"]).default("week").describe("every 2 week = every 2 weeks"),
    startDate: optionalDateSchema("First time on the list YYYY-MM-DD (default today)"),
    quantity: z.number().positive().max(100_000).optional(),
    shop: entityRef("shop").optional(),
    list: entityRef("shopping_list").optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a recurring shopping item", nl: "Vaste boodschap bewaard" },
  describe: (ctx, input) => {
    const every = input.every === 1 ? say(ctx.locale, `every ${input.unit}`, { day: "elke dag", week: "elke week", month: "elke maand" }[input.unit]) : say(ctx.locale, `every ${input.every} ${input.unit}s`, `om de ${input.every} ${{ day: "dagen", week: "weken", month: "maanden" }[input.unit]}`);
    const from = input.startDate ? say(ctx.locale, ` from ${day(input.startDate, "en")}`, ` vanaf ${day(input.startDate, "nl")}`) : "";
    return say(ctx.locale, `${input.name} on the list ${every}${from}`, `${input.name} ${every} op de lijst${from}`);
  },
  run: async (ctx, input) => {
    const overview = await getShoppingOverview(ctx.householdId);
    const current = input.staple ? overview.staples.find((staple) => staple.id === input.staple?.id) : undefined;
    const listId = input.list?.id ?? current?.listId ?? (await getDefaultList(ctx.householdId, "staple", ctx.user.locale)).id;
    const data = {
      listId,
      productId: current?.productId ?? null,
      name: input.name,
      quantity: input.quantity ?? current?.quantity ?? 1,
      unit: current?.unit ?? null,
      shopId: input.shop?.id ?? current?.shopId ?? null,
      rrule: formatStapleRRule({ freq: FREQ[input.unit], interval: input.every }),
      startDate: input.startDate ?? current?.startDate ?? todayIn(),
    };
    const staple = current ? await updateStaple(ctx.householdId, current.id, data) : await createStaple(ctx.householdId, data);
    return done(`${staple.name} comes on the list next on ${day(staple.nextDueOn)}.`, { id: staple.id });
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): the shopping list (also per shop) and the products list ──

registerScreenContext({
  kind: "shopping",
  skills: ["shopping"],
  describe: (ctx) => ({ label: say(ctx.locale, "Shopping list", "Boodschappenlijst"), summary: "the shopping list" }),
});

registerScreenContext({
  kind: "products",
  skills: ["inventory", "shopping"],
  describe: (ctx) => ({ label: say(ctx.locale, "Products", "Producten"), summary: "the household's products (catalogue for the list and the stock)" }),
});
