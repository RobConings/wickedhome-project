import { z } from "zod";
import { idSchema } from "@/types/common";
import {
  type ShoppingStockStatus,
  type ShoppingStockNeed,
  productCategorySchema,
} from "./shopping";

const amount = z.number().min(0.001).max(100_000).multipleOf(0.001);
export const sessionCreateSchema = z.object({
  operationId: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Stable session-start action id; reuse with unchanged input on retry",
    ),
  name: z.string().trim().min(1).max(100).optional(),
  selection: z.enum(["selected", "matching"]).optional().describe(
    "Prefer matching: choose exactly one shopId OR shopGroupId; matching open needs become the checklist automatically. Omit name for a suggested name. Selected retains explicit requirementIds, including an intentionally empty visit",
  ),
  shopIds: z.array(idSchema).max(30).default([]),
  shopGroupId: idSchema.optional(),
  requirementIds: z
    .array(idSchema)
    .max(300)
    .default([])
    .describe(
      "Selected shopping_list requirement ids; empty creates an empty visit",
    ),
  includeLowStock: z
    .boolean()
    .default(true)
    .describe(
      "False excludes automatic minimum-stock quantities, including in mixed recipe rows; does not change minima",
    ),
}).superRefine((value, ctx) => {
  if (value.selection !== "matching" && !value.name)
    ctx.addIssue({ code: "custom", path: ["name"], message: "Give the visit a name" });
  if (value.selection === "matching" && ((value.shopGroupId ? 1 : 0) + value.shopIds.length !== 1))
    ctx.addIssue({ code: "custom", path: ["shopIds"], message: "Choose one shop or saved shop group" });
  if (value.selection === "matching" && value.requirementIds.length)
    ctx.addIssue({ code: "custom", path: ["requirementIds"], message: "Matching visits select their needs automatically" });
});
export const sessionAddItemSchema = z
  .object({
    requirementId: idSchema.optional(),
    productId: idSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    quantity: amount.default(1),
    unit: z
      .string()
      .trim()
      .max(20)
      .nullable()
      .optional()
      .describe(
        "Omit to use known household stock unit. One potje counts as one; no gram weight required",
      ),
    category: productCategorySchema.optional(),
    stockItemId: idSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.requirementId || value.productId || value.name),
    "Choose a product or requirement, or give its name",
  );
export const sessionItemUpdateSchema = z.object({
  revision: z
    .number()
    .int()
    .min(0)
    .describe(
      "Current ITEM revision from shopping_session, not session revision; reread after conflict",
    ),
  operationId: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe(
      "Unique id for this action; retry with SAME id and payload; new action needs a new id",
    ),
  status: z.enum(["open", "bought", "skipped"]).optional(),
  productId: idSchema.optional().describe(
    "Selected variant: current product or a product sharing its canonical stock product. Changes future acquisitions only; use add-item for unrelated goods",
  ),
  quantity: amount
    .optional()
    .describe("Planned total; changing it alone does not buy goods"),
  purchasedQuantity: amount
    .optional()
    .describe(
      "Cumulative TOTAL bought in item units: 1 earlier + 1 now = 2. Omit with status bought to buy the planned total",
    ),
  stockItemId: idSchema.optional(),
  remove: z.boolean().optional(),
});
export const receiptAttachSchema = z.object({
  shopId: idSchema.optional(),
  documentId: idSchema,
  purchasedAt: z.iso.datetime(),
  totalCents: z.number().int().min(0).max(100_000_000).optional(),
});
export const receiptLineSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      "Stable printed receipt line number; reuse for the same real line, never randomize on retry",
    ),
  sessionItemId: idSchema,
  quantity: amount.describe(
    "Total on this receipt line in the selected session item unit; do not infer gram weights",
  ),
  stockItemId: idSchema.optional(),
  acceptDifference: z.boolean().default(false),
  existingPurchaseIds: z
    .array(idSchema)
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Existing acquisition ids for these same goods, not product ids; linking prevents double stock",
    ),
  countDisposition: z
    .enum(["already_counted", "add_after_count"])
    .optional()
    .describe(
      "Only after the person confirms how goods relate to a later physical stock count",
    ),
});
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionAddItemInput = z.infer<typeof sessionAddItemSchema>;
export type SessionItemUpdateInput = z.infer<typeof sessionItemUpdateSchema>;
export type ReceiptAttachInput = z.infer<typeof receiptAttachSchema>;
export type ReceiptLineInput = z.infer<typeof receiptLineSchema>;

export type SessionItem = {
  stockNeed: ShoppingStockNeed | null;
  stockStatus: ShoppingStockStatus | null;
  isEssential: boolean | null;
  id: string;
  productId: string | null;
  name: string;
  category: string;
  quantity: number;
  purchasedQuantity: number;
  unit: string | null;
  status: "open" | "bought" | "skipped";
  revision: number;
  stockItemId: string | null;
  requirementIds: string[];
};
export type SessionSummary = {
  id: string;
  name: string;
  status: "active" | "closed";
  startedAt: string;
  closedAt: string | null;
  shopIds: string[];
  revision: number;
};
export type SessionView = SessionSummary & {
  items: SessionItem[];
  participants: { userId: string; name: string }[];
  purchases: {
    id: string;
    shopId: string | null;
    purchasedAt: string;
    totalCents: number | null;
    receipts: {
      shopId: string | null;
      id: string;
      documentId: string | null;
      filename: string;
      totalCents: number | null;
      purchasedAt: string;
    }[];
    payments: {
      id: string;
      expenseId: string | null;
      receiptId: string | null;
      amountCents: number;
      payee: string;
      paidOn: string | null;
      paymentAccountId: string | null;
      payerType: string | null;
      payerHabitantId: string | null;
    }[];
    lines: {
      name: string;
      /** Actual acquired variant; null when the historic identity is unknown/unlinked. */
      productId: string | null;
      id: string;
      sessionItemId: string | null;
      /** Selected goods; older acquisitions may only have the canonical stock quantity below. */
      purchasedQuantity?: number | null;
      purchasedUnit?: string | null;
      /** Canonical stock-credit quantity/unit, retained for existing clients. */
      quantity: number;
      unit: string | null;
      stockAdded: boolean;
    }[];
  }[];
  stockOptions: {
    id: string;
    productId: string;
    placeName: string;
    unit: string | null;
  }[];
};

export type ShoppingFinanceOptions = {
  accounts: { id: string; name: string }[];
  habitants: { id: string; name: string }[];
  expenses: {
    id: string;
    payee: string;
    amountCents: number;
    paidOn: string | null;
  }[];
};
