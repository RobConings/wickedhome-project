import { z } from "zod";
import { idSchema } from "@/types/common";
import { productCategorySchema } from "./shopping";

const amount = z.number().min(0.001).max(100_000).multipleOf(0.001);
export const sessionCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  shopIds: z.array(idSchema).max(30).default([]),
  shopGroupId: idSchema.optional(),
  requirementIds: z.array(idSchema).max(300).default([]),
  includeLowStock: z.boolean().default(true),
});
export const sessionAddItemSchema = z.object({
  requirementId: idSchema.optional(), productId: idSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  quantity: amount.default(1), unit: z.string().trim().max(20).nullable().optional(),
  category: productCategorySchema.optional(), stockItemId: idSchema.optional(),
}).refine((value) => Boolean(value.requirementId || value.productId || value.name), "Choose a product or requirement, or give its name");
export const sessionItemUpdateSchema = z.object({
  revision: z.number().int().min(0), operationId: z.string().trim().min(1).max(160),
  status: z.enum(["open", "bought", "skipped"]).optional(),
  quantity: amount.optional(), purchasedQuantity: amount.optional(), stockItemId: idSchema.optional(),
  remove: z.boolean().optional(),
});
export const receiptAttachSchema = z.object({
  shopId: idSchema.optional(),
  documentId: idSchema, purchasedAt: z.iso.datetime(),
  totalCents: z.number().int().min(0).max(100_000_000).optional(),
});
export const receiptLineSchema = z.object({
  reference: z.string().trim().min(1).max(100), sessionItemId: idSchema,
  quantity: amount, stockItemId: idSchema.optional(),
  acceptDifference: z.boolean().default(false),
  existingPurchaseIds: z.array(idSchema).min(1).max(50).optional(),
  countDisposition: z.enum(["already_counted", "add_after_count"]).optional(),
});
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionAddItemInput = z.infer<typeof sessionAddItemSchema>;
export type SessionItemUpdateInput = z.infer<typeof sessionItemUpdateSchema>;
export type ReceiptAttachInput = z.infer<typeof receiptAttachSchema>;
export type ReceiptLineInput = z.infer<typeof receiptLineSchema>;

export type SessionItem = {
  id: string; productId: string | null; name: string; category: string; quantity: number;
  purchasedQuantity: number; unit: string | null; status: "open" | "bought" | "skipped";
  revision: number; stockItemId: string | null; requirementIds: string[];
};
export type SessionSummary = { id: string; name: string; status: "active" | "closed"; startedAt: string; closedAt: string | null; shopIds: string[]; revision: number };
export type SessionView = SessionSummary & {
  items: SessionItem[]; participants: { userId: string; name: string }[];
  purchases: { id: string; shopId: string | null; purchasedAt: string; totalCents: number | null;
    receipts: { id: string; documentId: string | null; filename: string; totalCents: number | null; purchasedAt: string }[];
    payments: { id: string; expenseId: string | null; receiptId: string | null; amountCents: number; payee: string; paidOn: string | null; paymentAccountId: string | null; payerType: string | null; payerHabitantId: string | null }[];
    lines: { id: string; sessionItemId: string | null; quantity: number; unit: string | null; stockAdded: boolean }[];
  }[];
  stockOptions: { id: string; productId: string; placeName: string; unit: string | null }[];
};

export type ShoppingFinanceOptions = {
  accounts: { id: string; name: string }[];
  habitants: { id: string; name: string }[];
  expenses: { id: string; payee: string; amountCents: number; paidOn: string | null }[];
};
