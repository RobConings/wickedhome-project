import { z } from "zod";
export const collectAndGoUrlSchema = z.url().refine((value) => { const u = new URL(value); return u.protocol === "https:" && u.hostname === "www.collectandgo.be" && !u.username && !u.password && !u.port && u.pathname.startsWith("/nl/assortiment/"); }, "Use a Collect&Go product link");
export const collectAndGoSearchSchema = z.object({ query: z.string().trim().min(2).max(100), quantity: z.number().int().min(1).max(50).default(1), promotionsOnly: z.boolean().default(false) });
export type CollectAndGoOffer = { id: string; name: string; url: string; image: string | null; priceCents: number | null; unitPrice: string | null; promotion: string | null; observedAt: string; priceContext: string; quantity: number; score: number; estimatedTotalCents: number | null; promotionApplied: boolean; promotionNote: string | null };
export type CollectAndGoStatus = { connected: boolean; enabled: boolean; cartEnabled?: boolean; configured: boolean; canManage: boolean; canUse: boolean; needsReconnect: boolean; legacyAvailable: boolean; importedAt: string | null; verifiedAt?: string | null; members: { id: string; name: string; role: string; allowed: boolean }[] };
export type CollectAndGoCart = {
  observedAt: string;
  authenticated: true;
  items: { name: string; url: string | null; quantity: number; unitPriceCents: number | null }[];
  truncated: boolean;
};
export const collectAndGoOrderIdSchema = z.string().regex(/^\d{1,20}$/);
export type CollectAndGoOrder = {
  id: string;
  url: string;
  status: string;
  pickupPoint: string | null;
  pickupFrom: string | null;
  pickupUntil: string | null;
  amendableUntil: string | null;
  providerAmendable: boolean | null;
  editState: "open" | "closed" | "unknown";
  estimatedTotalCents: number | null;
};
export type CollectAndGoOrders = { authenticated: true; observedAt: string; timeZone: "Europe/Brussels"; orders: CollectAndGoOrder[]; truncated: boolean };
export type CollectAndGoOrderDetail = CollectAndGoOrder & { authenticated: true; observedAt: string; timeZone: "Europe/Brussels"; items: CollectAndGoCart["items"]; truncated: boolean };
export type CollectAndGoCheck = { status: CollectAndGoStatus; cart: CollectAndGoCart };

const cookieSchema = z.object({ name: z.string().min(1).max(200).regex(/^[^\s;=\r\n]+$/), value: z.string().max(16000).regex(/^[^\r\n;]*$/), domain: z.string().refine((v) => /(^|\.)(collectandgo\.be|colruytgroup\.com|xtra\.be)$/.test(v)), path: z.string().startsWith("/").max(1000), expires: z.number().finite(), httpOnly: z.boolean(), secure: z.boolean(), sameSite: z.enum(["Strict", "Lax", "None"]) });
export const collectAndGoCartApiSchema = z.object({ storeId: z.string().regex(/^\d{1,20}$/), catalogId: z.string().regex(/^\d{1,20}$/), langId: z.string().regex(/^-?\d{1,5}$/), authToken: z.string().min(1).max(16000).regex(/^[\x20-\x7e]+$/), apiKey: z.string().min(1).max(2000).regex(/^[\x20-\x7e]+$/) });
export const collectAndGoStateSchema = z.object({ cookies: z.array(cookieSchema).max(500), cartApi: collectAndGoCartApiSchema.optional(), origins: z.array(z.object({ origin: z.url().refine((v) => /^https:\/\/([\w-]+\.)?(collectandgo\.be|colruytgroup\.com|xtra\.be)$/.test(v)), localStorage: z.array(z.object({ name: z.string().max(500), value: z.string().max(100000) })).max(100) })).max(20), userAgent: z.string().min(1).max(512).regex(/^[\x20-\x7e]+$/).optional() });
export type CollectAndGoState = z.infer<typeof collectAndGoStateSchema>;
export const collectAndGoAccessSchema = z.object({ userIds: z.array(z.string().min(1).max(100)).max(100) });
export const collectAndGoConnectionInputSchema = collectAndGoAccessSchema.extend({ state: collectAndGoStateSchema.refine((state) => state.cookies.some((cookie) => /(^|\.)collectandgo\.be$/.test(cookie.domain)), "No Collect&Go cookies were found") });
