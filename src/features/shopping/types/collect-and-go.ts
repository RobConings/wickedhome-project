import { z } from "zod";
export const collectAndGoUrlSchema = z.url().refine((value) => { const u = new URL(value); return u.protocol === "https:" && u.hostname === "www.collectandgo.be" && !u.username && !u.password && !u.port && u.pathname.startsWith("/nl/assortiment/"); }, "Use a Collect&Go product link");
export const collectAndGoSearchSchema = z.object({ query: z.string().trim().min(2).max(100), quantity: z.number().int().min(1).max(50).default(1), promotionsOnly: z.boolean().default(false) });
export type CollectAndGoOffer = { id: string; name: string; url: string; image: string | null; priceCents: number | null; unitPrice: string | null; promotion: string | null; observedAt: string; priceContext: string; quantity: number; score: number; estimatedTotalCents: number | null; promotionApplied: boolean; promotionNote: string | null };
export type CollectAndGoStatus = { connected: boolean; enabled: boolean; importedAt: string | null };
