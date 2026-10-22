import { z } from "zod";
import { SHOPPING_LIST_KINDS, formatQuantity, type ShoppingItem } from "@/features/shopping/types/shopping";
import { formatStapleRRule } from "@/features/shopping/types/staple-recurrence";
import { todayIn } from "@/types/dates";
import { badRequest, forbidden } from "@/api/lib/http";
import { findRestockTarget, restockFromShoppingItem } from "@/api/inventory/inventory.service";
import {
  createItem,
  createList,
  createStaple,
  deleteItem,
  deleteList,
  deleteStaple,
  getDefaultList,
  getShoppingOverview,
  listItems,
  updateItem,
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
import { openFirst } from "../tasks/task-input";
import { stockPriority } from "./stock-priority";

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

const qty = (item: Pick<ShoppingItem, "quantity" | "unit">, locale: "en" | "nl") =>
  item.quantity !== 1 || item.unit ? `${formatQuantity(item.quantity, locale)}${item.unit ? ` ${item.unit}` : ""}` : null;

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
  // Open items, plus items bought in the last day whose name no open item has (to untick them).
  list: async (ctx) => {
    const { items } = await getShoppingOverview(ctx.householdId);
    const open = items.filter((item) => item.status === "open");
    const bought = items.filter((item) => item.status === "bought");
    return openFirst(open, bought, (item) => item.name).map((item) => ({
      id: item.id,
      name: item.name,
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

registerAssistantTool({
  name: "shopping.list",
  description:
    "Shopping items with stockStatus, buyingAdvice (below_minimum = to_buy; at_minimum = warning), essential and importance (essential or nice_to_have). All products at or below minimum stay listed; essential is separate from urgency, and the person chooses what to buy. Filter by shop, list, task, stockStatus or isEssential; bought shows recent purchases.",
  input: z.object({
    shop: entityRef("shop", "Only items for this shop").optional(),
    list: entityRef("shopping_list").optional(),
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
    const status = input.bought ? "bought" : "open";
    const source = input.task ? await listItems(ctx.householdId, { taskId: input.task.id }, ctx.locale) : overview.items;
    const items = source.filter(
      (item) =>
        (input.task || item.status === status) &&
        (!input.shop || item.shopId === input.shop.id) &&
        (!input.list || item.listId === input.list.id) &&
        (input.isEssential === undefined || item.isEssential === input.isEssential) &&
        (!input.stockStatus || item.stockStatus === input.stockStatus),
    );
    const open = overview.items.filter((item) => item.status === "open");
    const manyLists = overview.lists.length > 1;
    return {
      open: open.length,
      perShop: input.shop || input.task ? null : shopSummary(items),
      lists: manyLists && !input.list ? overview.lists.map((list) => `${list.name} (${list.openCount})`) : null,
      ...capList(items, LIST_LIMIT, (item) => ({
        name: item.name,
        qty: qty(item, ctx.locale),
        list: manyLists && !input.list ? item.listName : null,
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
  description: "Put an item on a shopping list (default list unless named). For a catalogue product also pass product so its essential setting and current stock warning appear. One call per item. With a task it is material for that task.",
  input: z.object({
    name: z.string().trim().min(1).max(120).describe("What to buy, e.g. 'melk'"),
    product: entityRef("product", "Catalogue product to link; keeps its essential/nice-to-have setting and stock status").optional(),
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
    return say(ctx.locale, `Put ${amount}${input.name}${where ? ` (${where})` : ""} on ${list}`, `${amount}${input.name}${where ? ` (${where})` : ""} op ${list} zetten`);
  },
  run: async (ctx, input) => {
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
    return done(`${item.name} is on the list “${item.listName}”${item.shop ? ` (${item.shop.name})` : ""}.`, { id: item.id, ...stockPriority(item.stockStatus, item.isEssential) });
  },
});

registerAssistantTool({
  name: "shopping.update_item",
  description: "Tick an item off as bought (or back to open), move it to another shop or list, or change its name, quantity, unit or note. addToStock puts a bought item in the stock.",
  input: z.object({
    item: entityRef("shopping_item", "The item's name on the list"),
    bought: z.boolean().optional().describe("true = ticked off (bought), false = back on the list"),
    shop: entityRef("shop", "Move to this shop").optional(),
    noShop: z.boolean().optional().describe("Remove the shop"),
    list: entityRef("shopping_list", "Move to this list").optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().max(20).optional(),
    note: z.string().trim().max(500).optional(),
    addToStock: z.boolean().optional().describe("Bought: add it to the household stock too"),
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
    const { item, justBought } = await updateItem(ctx.user, input.item.id, {
      ...(input.bought !== undefined && { status: input.bought ? ("bought" as const) : ("open" as const) }),
      ...(input.shop && { shopId: input.shop.id }),
      ...(input.noShop && { shopId: null }),
      ...(input.list && { listId: input.list.id }),
      ...(input.name && { name: input.name }),
      ...(input.quantity && { quantity: input.quantity }),
      ...(input.unit !== undefined && { unit: input.unit || null }),
      ...(input.note !== undefined && { note: input.note || null }),
    });
    const restock = justBought || (input.addToStock && item.status === "bought") ? await findRestockTarget(ctx.householdId, item) : null;
    if (restock && input.addToStock) {
      await restockFromShoppingItem(ctx.user, item.id, { stockItemId: restock.stockItemId, quantity: restock.quantity });
      return done(`Ticked off ${item.name}; added ${formatQuantity(restock.quantity, ctx.locale)} to the stock in ${restock.placeName}.`);
    }
    const hint = restock
      ? ` It is kept in stock (${restock.placeName}): offer to add it (addToStock).`
      : input.addToStock
        ? " It isn't kept in stock, so nothing was added there."
        : "";
    const state = item.status === "bought" ? `Ticked off ${item.name}.` : `${item.name} is on “${item.listName}”${item.shop ? ` (${item.shop.name})` : ""}.`;
    return done(`${state}${hint}`);
  },
});

registerAssistantTool({
  name: "shopping.remove",
  description: "Delete an item from the shopping list, a whole list (with its items and staples), or a recurring staple. Give exactly one of item, list, staple.",
  input: z.object({
    item: entityRef("shopping_item").optional(),
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
