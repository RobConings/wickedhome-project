import { xtraAddSchema, xtraListSchema, xtraRemoveSchema, xtraSearchSchema, type XtraListResult, type XtraSearchResult } from "@/features/shopping/types/xtra";
import { addXtra, listXtra, removeXtra, searchXtra, xtraAdditionPreview, xtraAvailable, xtraRemovalPreview } from "@/api/shopping/xtra.service";
import { money, registerAssistantTool, say } from "@ai/core/kit";

registerAssistantTool({
  name: "shopping.xtra_search", input: xtraSearchSchema, permission: "read", confirm: "never", available: xtraAvailable,
  description: "Search Colruyt products for in-store shopping using the household's shared Xtra connection. Xtra/Colruyt is the physical-store shopping list; Collect&Go is the separate online ordering channel in the same retail group. Access is limited to accounts selected by a household owner. Returns observed store-specific prices, package sizes and IDs. These aren't guaranteed Collect&Go prices or dietary equivalents. This is not a complete promotions feed: when preparing a list, separately search current promotions online with your own browsing or web_search then web_read. Verify dates, exact packages and quantity/loyalty conditions, cite sources, and flag anything unverified. Choose a returned offer before changing the Xtra shopping list.",
  activity: { en: "Searched Colruyt in-store products", nl: "Colruyt-winkelproducten gezocht" },
  run: (ctx, input) => searchXtra(ctx.user, input, ctx.signal),
  present: (ctx, _input, data) => {
    const result = data as XtraSearchResult;
    return { version: 1, components: [{ type: "products", title: say(ctx.locale, "Colruyt / Xtra · In-store shopping", "Colruyt / Xtra · Winkelen in de winkel"), items: result.products.map((product) => ({ name: product.name, image: product.imageUrl, price: money(product.priceCents), href: product.url ?? undefined, shop: say(ctx.locale, "Colruyt (in store)", "Colruyt (winkel)"), detail: [product.brand, product.content, say(ctx.locale, `Store ${result.placeId}`, `Winkel ${result.placeId}`), result.observedAt].filter(Boolean).join(" · ") })) }] };
  },
});
registerAssistantTool({
  name: "shopping.xtra_list", input: xtraListSchema, permission: "read", confirm: "never", available: xtraAvailable,
  description: "Read a page of the connected Xtra/Colruyt in-store shopping list for a physical store visit, including completed items. Follow nextOffset for more. This is separate from WickedHome shopping needs and from a Collect&Go basket or order. Read before removing an item.",
  activity: { en: "Read the Colruyt in-store list", nl: "Colruyt-winkellijstje gelezen" },
  run: (ctx, input) => listXtra(ctx.user, input, ctx.signal),
  present: (ctx, _input, data) => {
    const result = data as XtraListResult;
    return { version: 1, components: [{ type: "table", title: say(ctx.locale, "Colruyt / Xtra · In-store list", "Colruyt / Xtra · Winkellijstje"), columns: [say(ctx.locale, "Product", "Product"), say(ctx.locale, "Quantity", "Hoeveelheid"), say(ctx.locale, "Completed", "Afgevinkt")], rows: result.items.map((item) => [item.name, item.quantity === null ? "?" : `${item.quantity} ${item.unit ?? ""}`, item.completed ? "✓" : "—"]) }] };
  },
});
registerAssistantTool({
  name: "shopping.xtra_add", input: xtraAddSchema, permission: "sensitive", confirm: "always", available: xtraAvailable,
  description: "Add a chosen, recently searched whole-piece product to the household's Xtra/Colruyt in-store shopping list after confirmation. This prepares a physical store visit; use Collect&Go tools for an online order, even though both belong to the same retail group. Before proposing the list, separately search online for current promotions using your own browsing or web_search then web_read; verify and cite dates/package/quantity/loyalty conditions, or state that promotions remain unverified. Never assume this tool applies a discount. Quantity is the amount added, not a final basket quantity; extra quantities or substitutions for deals need agreement. Use a new operationId UUID for each intended addition and keep it for retries. Never orders or records a purchase. An uncertain result requires inspecting the list before any new attempt.",
  activity: { en: "Added to the Colruyt in-store list", nl: "Toegevoegd aan het Colruyt-winkellijstje" },
  describe: async (ctx, input) => { const product = await xtraAdditionPreview(ctx.user, input.offer); return say(ctx.locale, `Add ${input.quantity} × ${product.name} to the shared Colruyt in-store list (Xtra)`, `${input.quantity} × ${product.name} toevoegen aan het gedeelde Colruyt-winkellijstje (Xtra)`); },
  preview: async (ctx, input) => { const product = await xtraAdditionPreview(ctx.user, input.offer); return { kind: "fields", title: say(ctx.locale, "Colruyt / Xtra · In-store list", "Colruyt / Xtra · Winkellijstje"), data: { fields: [{ label: "Product", value: product.name }, { label: say(ctx.locale, "Added quantity", "Toe te voegen hoeveelheid"), value: String(input.quantity) }, { label: say(ctx.locale, "Package", "Verpakking"), value: product.content ?? "?" }, { label: say(ctx.locale, "Observed unit price", "Bekeken stukprijs"), value: money(product.priceCents) ?? "?" }] } }; },
  run: (ctx, input) => addXtra(ctx.user, input, ctx.signal),
});
registerAssistantTool({
  name: "shopping.xtra_remove", input: xtraRemoveSchema, permission: "sensitive", confirm: "always", available: xtraAvailable,
  description: "Remove one item UUID from the shared Xtra/Colruyt in-store shopping list after confirmation. This only changes the physical-store list, not the Collect&Go online basket. Requires reading that item recently. Use a new operationId UUID for this removal and preserve it on retries. Does not affect WickedHome needs, purchases or stock.",
  activity: { en: "Removed a Colruyt in-store list item", nl: "Colruyt-winkellijstitem verwijderd" },
  describe: async (ctx, input) => { const item = await xtraRemovalPreview(ctx.user, input.itemId); return say(ctx.locale, `Remove ${item.name} from the shared Colruyt in-store list (Xtra)`, `${item.name} uit het gedeelde Xtra-lijstje verwijderen`); },
  run: (ctx, input) => removeXtra(ctx.user, input, ctx.signal),
});
