import { z } from "zod";
const text = z.string().max(4000);
export const assistantHrefSchema = z.string().max(2000).refine((value) => /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)[\w/?#=&.%+~-]*$/.test(value), "Use an HTTP(S) or application link");
const link = z.object({ label: text, href: assistantHrefSchema });
const row = z.object({ id: z.string().max(200), label: text, detail: text.optional(), group: text.optional(), href: assistantHrefSchema.optional(), status: text.optional(), actions: z.array(z.object({ label: text, message: z.string().min(1).max(4000) })).max(4).optional() });
const product = z.object({ name: text, image: assistantHrefSchema.nullish(), price: text.nullish(), shop: text.nullish(), detail: text.nullish(), href: assistantHrefSchema.optional() });
export const responseComponentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("summary"), title: text, values: z.array(z.object({ label: text, value: text })).max(30) }),
  z.object({ type: z.literal("products"), title: text, items: z.array(product).max(60) }),
  z.object({ type: z.literal("recipes"), title: text, items: z.array(product).max(60) }),
  z.object({ type: z.literal("table"), title: text, columns: z.array(text).min(1).max(12), rows: z.array(z.array(text).max(12)).max(100) }),
  z.object({ type: z.literal("chart"), title: text, style: z.enum(["bar", "line"]).optional(), points: z.array(z.object({ label: text, value: z.number().finite(), display: text })).max(60) }),
  z.object({ type: z.enum(["shopping", "tasks", "inventory", "calendar"]), title: text, items: z.array(row).max(100) }),
  z.object({ type: z.literal("choices"), title: text, choices: z.array(z.object({ label: text, message: z.string().min(1).max(4000) })).min(1).max(12) }),
  z.object({ type: z.literal("date_time"), title: text, prompt: z.string().min(1).max(2000), includeTime: z.boolean() }),
  z.object({ type: z.literal("progress"), title: text, completed: z.number().int().nonnegative(), total: z.number().int().positive(), detail: text.optional() }),
  z.object({ type: z.literal("links"), title: text, links: z.array(link).max(20) }),
  z.object({ type: z.literal("error"), title: text, detail: text, recovery: z.array(link).max(5) }),
]);
export const structuredResponseSchema = z.object({ version: z.literal(1), components: z.array(responseComponentSchema).min(1).max(20) });
export type StructuredResponse = z.infer<typeof structuredResponseSchema>;
export type ResponseComponent = z.infer<typeof responseComponentSchema>;
