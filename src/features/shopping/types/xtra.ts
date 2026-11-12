import { z } from "zod";

const headerValue = z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/).refine((value) => !value.includes(";"));
/** Only the shop session, never an Xtra password or identity-provider tokens. */
export const xtraCredentialsSchema = z.object({
  sessionId: headerValue,
  apiKey: headerValue,
  placeId: z.string().regex(/^\d{1,12}$/),
  reese84: headerValue.optional(),
  userAgent: z.string().min(1).max(512).regex(/^[\x20-\x7e]+$/).optional(),
});
export type XtraCredentials = z.infer<typeof xtraCredentialsSchema>;
export const xtraAccessSchema = z.object({ userIds: z.array(z.string().min(1).max(100)).max(100) });
export const xtraConnectSchema = xtraAccessSchema.extend({ credentials: xtraCredentialsSchema });
export const xtraSearchSchema = z.object({ query: z.string().trim().min(2).max(120) });
export const xtraListSchema = z.object({ limit: z.number().int().min(1).max(100).default(40), offset: z.number().int().min(0).max(5000).default(0) });
export const xtraAddSchema = z.object({
  offer: z.string().regex(/^xt-[a-f0-9]{24}$/),
  quantity: z.number().int().min(1).max(99),
  operationId: z.uuid().describe("A new UUID for this addition; reuse it only when retrying this exact operation"),
});
export const xtraRemoveSchema = z.object({ itemId: z.uuid(), operationId: z.uuid() });
export type XtraProduct = {
  offer: string;
  productId: string;
  name: string;
  brand: string | null;
  content: string | null;
  imageUrl: string | null;
  barcode: string | null;
  priceCents: number | null;
  unit: string | null;
  url: string | null;
  existingProduct: { id: string; name: string } | null;
};
export type XtraSearchResult = { products: XtraProduct[]; placeId: string; observedAt: string };
export type XtraListItem = { id: string; name: string; productId: string | null; quantity: number | null; unit: string | null; completed: boolean };
export type XtraListResult = { items: XtraListItem[]; nextOffset: number | null; placeId: string; observedAt: string };
export type XtraStatus = {
  configured: boolean;
  connected: boolean;
  canUse: boolean;
  canManage: boolean;
  needsReconnect: boolean;
  connectedAt: string | null;
  checkedAt: string | null;
  placeId: string | null;
  members: { id: string; name: string; role: string; allowed: boolean }[];
};
