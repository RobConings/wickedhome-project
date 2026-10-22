import { z } from "zod";
import { SHOP_TYPES, shopInputSchema, type Shop } from "@/features/shops/types/shops";
import { addDays, todayIn } from "@/types/dates";
import { listStoreVisits } from "@/api/calendar/calendar.service";
import { addFavorite, getSelections, removeFavorite } from "@/api/selections/selections.service";
import { listItems } from "@/api/shopping/shopping.service";
import { createShop, deleteShop, getShop, listShops, updateShop } from "@/api/shops/shops.service";
import { capList, day, done, entityRef, registerAssistantSkill, registerAssistantTool, registerScreenContext, say } from "@ai/core/kit";

/** Skill "shops": the shops the household buys at (guide: guide.md next to this file). The `shop` resolver lives in shopping. */

registerAssistantSkill({
  id: "shops",
  title: { en: "Shops", nl: "Winkels" },
  summary: "Shops: favourites, address, opening hours, website and webshop; add, edit, delete shops.",
  keywords: {
    nl: ["winkel", "winkels", "webshop", "webwinkel", "openingsuren", "openingstijden", "favoriete winkel", "bouwmarkt", "doe-het-zelfzaak"],
    en: ["shop", "shops", "store", "stores", "webshop", "online shop", "opening hours", "favourite shop", "favorite shop", "diy store"],
  },
});

const LIST_LIMIT = 25;

const row = (shop: Shop, favorite: boolean) => ({
  name: shop.name,
  type: shop.type,
  favorite: favorite || null,
  own: !shop.isBuiltIn || null,
  webshop: shop.hasWebshop || null,
  /** Searched for recipe ingredients (recipes_find_product). */
  ingredientSearch: shop.ingredientSearch || null,
  website: shop.websiteUrl,
  address: shop.address,
});

registerAssistantTool({
  name: "shops.list",
  description:
    "The shops: favourites first, with type, webshop, website and address. Give a shop for its details (opening hours, notes, what is on the list for it, planned visits). Filter by name, type, favourites or webshops.",
  input: z.object({
    shop: entityRef("shop", "One shop's details").optional(),
    q: z.string().trim().max(80).optional().describe("Part of the name"),
    type: z.enum(SHOP_TYPES).optional(),
    favorites: z.boolean().optional().describe("Only the person's favourite shops"),
    webshop: z.boolean().optional().describe("Only shops with a webshop"),
  }),
  permission: "read",
  confirm: "never",
  activity: { en: "Checked the shops", nl: "Winkels bekeken" },
  run: async (ctx, input) => {
    const selections = await getSelections(ctx.user.id, "shop");
    const favorites = new Set(selections.favoriteIds);
    if (input.shop) {
      const today = todayIn();
      const [shop, items, visits] = await Promise.all([
        getShop(ctx.householdId, input.shop.id),
        listItems(ctx.householdId, { shopId: input.shop.id, status: "open" }),
        listStoreVisits(ctx.householdId, { shopId: input.shop.id, from: today, to: addDays(today, 60) }),
      ]);
      return {
        ...row(shop, favorites.has(shop.id)),
        openingHours: shop.openingHours,
        notes: shop.notes,
        onTheList: items.length ? capList(items, 15, (item) => item.name) : null,
        plannedVisits: visits.length ? visits.slice(0, 5).map((visit) => day(visit.start, ctx.locale)) : null,
      };
    }
    const shops = (await listShops(ctx.householdId, { type: input.type, q: input.q })).filter(
      (shop) => (!input.favorites || favorites.has(shop.id)) && (!input.webshop || shop.hasWebshop),
    );
    shops.sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
    return { count: shops.length, ...capList(shops, LIST_LIMIT, (shop) => row(shop, favorites.has(shop.id))) };
  },
});

registerAssistantTool({
  name: "shops.save",
  description: "Add a shop, or change one (address, opening hours, website, webshop yes/no, type, notes). Only what is given changes.",
  input: z.object({
    shop: entityRef("shop", "The shop to change; leave out to add one").optional(),
    name: z.string().trim().min(1).max(80).optional().describe("Required for a new shop"),
    type: z.enum(SHOP_TYPES).optional().describe("Default other for a new shop"),
    address: z.string().trim().max(200).optional(),
    websiteUrl: z.url({ protocol: /^https?$/ }).max(500).optional(),
    hasWebshop: z.boolean().optional(),
    openingHours: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  permission: "write",
  confirm: "always",
  activity: { en: "Saved a shop", nl: "Winkel bewaard" },
  describe: (ctx, input) =>
    input.shop
      ? say(ctx.locale, `Change the shop ${input.shop.name}`, `Winkel ${input.shop.name} aanpassen`)
      : say(ctx.locale, `Add the shop ${input.name ?? "?"}`, `Winkel ${input.name ?? "?"} toevoegen`),
  run: async (ctx, input) => {
    const current = input.shop ? await getShop(ctx.householdId, input.shop.id) : null;
    const data = shopInputSchema.parse({
      name: input.name ?? current?.name,
      type: input.type ?? current?.type ?? "other",
      address: input.address ?? current?.address ?? null,
      websiteUrl: input.websiteUrl ?? current?.websiteUrl ?? null,
      hasWebshop: input.hasWebshop ?? current?.hasWebshop ?? false,
      openingHours: input.openingHours ?? current?.openingHours ?? null,
      notes: input.notes ?? current?.notes ?? null,
    });
    const shop = current ? await updateShop(ctx.user, current.id, data) : await createShop(ctx.householdId, data);
    return done(`${current ? "Saved" : "Added"} the shop ${shop.name}.`, { id: shop.id });
  },
});

registerAssistantTool({
  name: "shops.favorite",
  description: "Mark a shop as one of the person's favourites (shown first everywhere), or remove the star.",
  input: z.object({ shop: entityRef("shop"), favorite: z.boolean().default(true) }),
  permission: "write",
  confirm: "first-time",
  // Personal preference: everyone, children too, as in the app.
  roles: ["owner", "adult", "child"],
  activity: { en: "Updated favourite shops", nl: "Favoriete winkels bijgewerkt" },
  describe: (ctx, input) =>
    input.favorite
      ? say(ctx.locale, `Add ${input.shop.name} to your favourite shops`, `${input.shop.name} bij je favoriete winkels zetten`)
      : say(ctx.locale, `Remove ${input.shop.name} from your favourite shops`, `${input.shop.name} uit je favoriete winkels halen`),
  run: async (ctx, input) => {
    await getShop(ctx.householdId, input.shop.id);
    const ref = { entityType: "shop" as const, entityId: input.shop.id };
    if (input.favorite) await addFavorite(ctx.user.id, ref);
    else await removeFavorite(ctx.user.id, ref);
    return done(`${input.shop.name} is ${input.favorite ? "now" : "no longer"} a favourite.`);
  },
});

registerAssistantTool({
  name: "shops.delete",
  description: "Delete one of the household's own shops (built-in shops can't be deleted).",
  input: z.object({ shop: entityRef("shop") }),
  permission: "sensitive",
  confirm: "always",
  activity: { en: "Deleted a shop", nl: "Winkel verwijderd" },
  describe: (ctx, input) => say(ctx.locale, `Delete the shop ${input.shop.name}`, `Winkel ${input.shop.name} verwijderen`),
  run: async (ctx, input) => {
    await deleteShop(ctx.user, input.shop.id);
    return done(`Deleted the shop ${input.shop.name}.`);
  },
});

// ── Screen context (ai/docs/ASSISTANT.md): a shop's page and the shops overview ──

registerScreenContext({
  kind: "shop",
  skills: ["shops", "shopping"],
  describe: async (ctx, id) => {
    if (!id) return null;
    const shop = await getShop(ctx.householdId, id);
    return { label: shop.name, summary: `shop "${shop.name}" (${shop.type.toLowerCase()}${shop.address ? `, ${shop.address}` : ""})` };
  },
});

registerScreenContext({
  kind: "shops",
  skills: ["shops"],
  describe: (ctx) => ({ label: say(ctx.locale, "Shops", "Winkels"), summary: "the shops overview" }),
});
