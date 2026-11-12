import { z } from "zod";
import { collectAndGoSearchSchema, type CollectAndGoOffer } from "@/features/shopping/types/collect-and-go";
import { collectAndGoEnabled, rememberedCollectAndGoOffer, searchCollectAndGo, setCollectAndGoBasket } from "@/api/shopping/collect-and-go-browser";
import { money, registerAssistantTool, say } from "@ai/core/kit";
registerAssistantTool({
  name: "shopping.collectandgo_search",
  description: "Find live Collect&Go products or current promotion-page matches for online ordering using the household's shared browser session. Collect&Go is the online ordering channel; Xtra/Colruyt is the separate in-store shopping list in the same retail group. Prices and promotions are channel-specific. Only accounts selected by an owner can use it; selected children can only read. Rank matches by words and estimate only explicit single-product discounts for the requested quantity. Price source, observed time and conditions are returned. Never infer dietary equivalence or substitute without the person choosing an offer. CAPTCHA requires a person; stop and explain.",
  input: collectAndGoSearchSchema, permission: "read", confirm: "never", available: collectAndGoEnabled,
  activity: { en: "Checked Collect&Go online products and promotions", nl: "Online Collect&Go-producten en promoties bekeken" },
  run: (ctx, input) => searchCollectAndGo(ctx.user, input.query, input.quantity, input.promotionsOnly, ctx.signal),
  present: (ctx, _input, data) => {
    const result = data as { offers: CollectAndGoOffer[] };
    return { version: 1, components: [{ type: "products", title: say(ctx.locale, "Collect&Go · Online ordering", "Collect&Go · Online bestellen"), items: result.offers.map((offer) => ({ name: offer.name, image: offer.image, price: money(offer.priceCents), shop: "Collect&Go (online)", href: offer.url, detail: [offer.promotion, offer.unitPrice, `${offer.quantity} ×: ${money(offer.estimatedTotalCents) ?? "?"}${offer.promotionApplied ? say(ctx.locale, " (estimated promotion)", " (geschatte promotie)") : ""}`, offer.priceContext, offer.observedAt].filter(Boolean).join(" · ") })) }, ...(result.offers.length ? [{ type: "choices" as const, title: say(ctx.locale, "Choose a product", "Kies een product"), choices: result.offers.slice(0,8).map((offer) => ({ label: offer.name, message: say(ctx.locale, `Prepare online basket offer ${offer.id} at Collect&Go (${offer.name}), final basket quantity ${offer.quantity}. Ask me to confirm first.`, `Zet online Collect&Go-aanbod ${offer.id} (${offer.name}) klaar, uiteindelijke hoeveelheid ${offer.quantity}. Vraag eerst mijn bevestiging.`) })) }] : [])] };
  },
});
registerAssistantTool({
  name: "shopping.collectandgo_basket",
  description: "Set an absolute final online basket quantity of a previously observed Collect&Go offer, after human confirmation. This prepares an online order, not the Xtra/Colruyt in-store shopping list. Never place an order. Requires access to the household's shared browser session; only accounts selected by an owner can use it. Rechecks identity, price and promotion; fails if changed, expired or unverified. A browser failure may leave a partial change: ask the person to inspect the basket before retrying.",
  input: z.object({ offer: z.string().regex(/^cg-[a-f0-9]{16}$/), quantity: z.number().int().min(1).max(50) }),
  permission: "sensitive", confirm: "always", available: collectAndGoEnabled,
  activity: { en: "Prepared the Collect&Go online basket", nl: "Collect&Go-onlinewinkelmand voorbereid" },
  describe: async (ctx, input) => { const offer = await rememberedCollectAndGoOffer(ctx.user, input.offer); return say(ctx.locale, `Set ${offer.name} to ${input.quantity} in the shared Collect&Go online basket (order not submitted)`, `${offer.name} op ${input.quantity} zetten in de gedeelde Collect&Go-onlinewinkelmand (bestelling niet geplaatst)`); },
  preview: async (ctx, input) => { const offer = await rememberedCollectAndGoOffer(ctx.user, input.offer); return { kind: "fields", title: say(ctx.locale, "Collect&Go · Online ordering", "Collect&Go · Online bestellen"), data: { fields: [{ label: say(ctx.locale, "Product", "Product"), value: offer.name }, { label: say(ctx.locale, "Final quantity", "Uiteindelijke hoeveelheid"), value: String(input.quantity) }, { label: say(ctx.locale, "Unit price", "Stukprijs"), value: money(offer.priceCents) ?? "?" }, { label: say(ctx.locale, "Promotion conditions", "Promotievoorwaarden"), value: offer.promotion ?? "—" }, { label: say(ctx.locale, "Observed", "Bekeken op"), value: offer.observedAt }] } }; },
  run: (ctx, input) => setCollectAndGoBasket(ctx.user, input.offer, input.quantity, ctx.signal),
});
