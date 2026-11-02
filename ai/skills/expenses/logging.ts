import { z } from "zod";
import { EXPENSE_CATEGORIES, expenseCreateInputSchema, type RecurringExpense } from "@/features/expenses/types/expenses";
import { todayIn } from "@/types/dates";
import { badRequest } from "@/api/lib/http";
import { entityRef, eurosSchema, optionalDateSchema, toCents, type AssistantToolContext } from "@ai/core/kit";

/** One paid-expense tool, with an optional link to the loan it repays. */
export const expenseLogInput = z.object({
  loan: entityRef("recurring_expense", "Extra repayment: the existing loan or down payment by name or id. For full payoff, read expenses_details first and use its remainingAmount as amount.").optional(),
  payee: z.string().trim().min(1).max(64).optional().describe("Shop or payee, e.g. 'Delhaize'; required unless loan is selected"),
  amount: eurosSchema.describe("Exact amount already paid in euros; partial or the full remaining balance. Never change a loan's totalOpen to record a repayment."),
  category: z.enum(EXPENSE_CATEGORIES).optional().describe("Best matching category; required unless loan is selected"),
  date: optionalDateSchema("Day it was paid, YYYY-MM-DD (default today)"),
  paymentMethod: z.enum(["card", "cash", "meal_voucher", "wire_transfer", "other"]).optional().describe("Default card for spending, wire_transfer for a loan repayment"),
  paidBy: z.enum(["joint", "me"]).default("joint").describe("Joint account, or the person asking paid personally; meal vouchers always belong to the person"),
  description: z.string().trim().max(200).optional(),
}).superRefine((input, ctx) => {
  if (!input.loan) {
    if (!input.payee) ctx.addIssue({ code: "custom", path: ["payee"], message: "Name the payee or select a loan" });
    if (!input.category) ctx.addIssue({ code: "custom", path: ["category"], message: "Choose a category or select a loan" });
  }
  if (input.loan && input.paymentMethod === "meal_voucher") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "A loan cannot be repaid with meal vouchers" });
  }
});
export type ExpenseLogInput = z.output<typeof expenseLogInput>;

/** Translate to the same expense contract as the UI; the service validates the live balance on write. */
export function loggedExpenseInput(ctx: AssistantToolContext, input: ExpenseLogInput, loan?: Pick<RecurringExpense, "id" | "payee" | "category">) {
  if (input.loan && loan?.id !== input.loan.id) throw badRequest("Loan not found");
  const me = input.paidBy === "me" || input.paymentMethod === "meal_voucher";
  if (me && !ctx.user.habitantId) throw badRequest("This account has no habitant to pay personally");
  const date = input.date ?? todayIn();
  return expenseCreateInputSchema.parse({
    payee: loan?.payee ?? input.payee,
    amountCents: toCents(input.amount),
    category: loan?.category ?? input.category,
    description: input.description ?? null,
    dueDate: date,
    paidOn: date,
    paymentMethod: input.paymentMethod ?? (loan ? "wire_transfer" : "card"),
    payerType: me ? "person" : "joint",
    payerHabitantId: me ? ctx.user.habitantId : null,
    earlyRepaymentForId: input.loan?.id,
  });
}
