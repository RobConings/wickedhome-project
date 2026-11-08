import { getGoodsAllocation, setGoodsAllocation } from "@/api/purchases/goods-allocation.service";
import { z } from "zod";
import { idSchema } from "@/types/common";
import { getPurchase, listPurchases } from "@/api/purchases/purchases.service";
import { capList, entityRef, registerAssistantSkill, registerAssistantTool, registerScreenContext, say } from "@ai/core/kit";

registerAssistantSkill({ id: "purchases", title: { en: "Purchases", nl: "Aankopen" },
  summary: "Existing acquisitions, selected product variants, receipts and linked expenses; product/project purchase context without duplicate stock or payments.",
  keywords: { en: ["purchase", "purchases", "acquisition", "receipt", "bought goods"], nl: ["aankoop", "aankopen", "aankoopgeschiedenis", "kassabon", "gekochte producten"] } });
registerAssistantTool({ name: "purchases.list", description: "Read recent existing acquisitions and visit purchases, optionally scoped to a product, project, buying need or shop. Totals can be unknown. Keep each returned kind and id for details; this creates no purchase or payment.",
  input: z.object({ productId: idSchema.optional(), projectId: idSchema.optional(), requirementId: idSchema.optional(), shopId: idSchema.optional() }), permission: "read", confirm: "never", activity: { en: "Checked purchase history", nl: "Aankoopgeschiedenis bekeken" },
  run: async (ctx, input) => capList(await listPurchases(ctx.user, input), 50, (row) => row) });
registerAssistantTool({ name: "purchases.details", description: "Read a purchase using its kind/id from purchases_list. Actual quantity and credited stock quantity can use different known units. Receipt evidence and linked expenses are separate. No financial details for children.",
  input: z.object({ id: idSchema, kind: z.enum(["visit", "acquisition"]).default("visit") }), permission: "read", confirm: "never", activity: { en: "Opened a purchase", nl: "Aankoop geopend" },
  run: (ctx, input) => getPurchase(ctx.user, input.id, input.kind) });
for (const kind of ["purchase", "acquisition"] as const) registerScreenContext({ kind, skills: ["purchases", "shopping", "expenses"],
  describe: async (ctx, id) => { if (!id) return null; const purchase = await getPurchase(ctx.user, id, kind === "purchase" ? "visit" : "acquisition"); return { label: purchase.name ?? say(ctx.locale, "Purchase", "Aankoop"), summary: `${purchase.kind} ${purchase.id}; ${purchase.lines.length} acquisition lines; session ${purchase.sessionId ?? "none"}; receipt, stock credit and payment are separate facts` }; } });
registerScreenContext({ kind: "purchases", skills: ["purchases"], describe: (ctx) => ({ label: say(ctx.locale, "Purchases", "Aankopen"), summary: "Recent existing acquisitions, receipts and linked expenses; no second ledger" }) });

registerAssistantTool({ name: "purchases.goods_allocation", description: "Read purpose shares and revision of an EXISTING acquisition line id from purchases_details.lines. Quantity/unit are the actual acquired goods. This is distinct from stock ownership/use and expense cost shares.",
  input: z.object({ acquisitionId: idSchema }), permission: "read", confirm: "never", activity: { en: "Checked goods allocation", nl: "Productverdeling bekeken" },
  run: (ctx, input) => getGoodsAllocation(ctx.householdId, input.acquisitionId) });
registerAssistantTool({ name: "purchases.allocate_goods", description: "Replace project/household quantity shares of existing acquired goods. Read purchases_goods_allocation first for revision and unit; never invent conversions. Total shares cannot exceed the acquisition. Remainder stays unassigned. This neither consumes nor reserves stock, fulfils another need, creates a purchase, assigns money nor debits an account. Cost shares use expenses_allocate_projects.",
  input: z.object({ acquisitionId: idSchema, revision: z.number().int().min(0), householdQuantity: z.number().min(0).max(100_000).multipleOf(0.001), projects: z.array(z.object({ project: entityRef("project"), quantity: z.number().min(0.001).max(100_000).multipleOf(0.001) })).max(50) }),
  permission: "write", confirm: "first-time", roles: ["owner", "adult"], activity: { en: "Assigned goods purpose", nl: "Productdoel toegewezen" },
  run: (ctx, input) => setGoodsAllocation(ctx.householdId, input.acquisitionId, { revision: input.revision, householdQuantity: input.householdQuantity, projects: input.projects.map((part) => ({ projectId: part.project.id, quantity: part.quantity })) }) });
