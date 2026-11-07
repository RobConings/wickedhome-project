import { z } from "zod";
import { idSchema } from "@/types/common";
import { expenseCreateInputSchema } from "./expenses";

/** Existing expense contracts keep payer/share/payment validation identical across web and MCP. */
export const shoppingPaymentSchema = z.object({
  reference: z.string().trim().min(1).max(100).describe("Stable payment identity, e.g. card-1 or meal-vouchers-1; reuse on retry"),
  receiptId: idSchema.optional(), expenseId: idSchema.optional(),
  expense: expenseCreateInputSchema.optional(),
  paymentAccountId: idSchema.optional(), paidByHabitantId: idSchema.optional(),
}).refine((value) => Boolean(value.expenseId) !== Boolean(value.expense), "Link an existing expense or create one, not both");
export type ShoppingPaymentInput = z.infer<typeof shoppingPaymentSchema>;
