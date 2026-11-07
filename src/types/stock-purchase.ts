import { z } from "zod";
import { idSchema } from "@/types/common";

export const purchaseSourceSchema = z.object({
  kind: z.enum(["scan", "receipt", "manual"]),
  reference: z.string().trim().min(1).max(180).describe("Stable scan operation id, or printed receipt line number. Reuse on retry."),
  documentId: idSchema.optional().describe("Uploaded receipt; required for receipt sources. Its content hash detects repeat uploads."),
}).refine((value) => value.kind !== "receipt" || Boolean(value.documentId), "A receipt needs an uploaded document");
export const stockPurchaseInputSchema = z.object({
  quantity: z.number().min(0.001).max(100_000).multipleOf(0.001),
  source: purchaseSourceSchema,
  purchasedAt: z.iso.datetime().optional(),
  shopId: idSchema.optional(),
  existingPurchaseIds: z.array(idSchema).min(1).max(50).optional(),
  separatePurchaseConfirmed: z.boolean().optional(),
  countDisposition: z.enum(["already_counted", "add_after_count"]).optional(),
  note: z.string().trim().max(200).optional(),
});
export type StockPurchaseInput = z.infer<typeof stockPurchaseInputSchema>;
export type StockPurchaseSummary = { id: string; quantity: number; unit: string | null; shopId: string | null; shopName?: string | null; purchasedAt: string; stockAdded: boolean };
export type StockPurchaseReview = { purchases: StockPurchaseSummary[]; lastCountedAt: string | null };
