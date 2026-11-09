import type { ExpenseCategory } from "@/features/expenses";
import { redirect, type ActionFunctionArgs } from "react-router";
import { z } from "zod";
import i18n from "i18next";
import { ApiRequestError } from "@/lib/api-client";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import { sessionItemUpdateSchema } from "../types/sessions";
import { handleProductAlternativeForm, handleProductForm } from "./shopping-loaders";
import { recordSessionPayment, addSessionItem, startShoppingSession, updateSessionItem } from "./sessions-requests";
import { recordSelection } from "@/lib/selections";

export const sessionAdjustFormSchema = sessionItemUpdateSchema.pick({
  quantity: true, productId: true, revision: true, operationId: true,
}).extend({ quantity: z.coerce.number().min(0.001).max(100_000).multipleOf(0.001), revision: z.coerce.number().int().min(0) });

export const sessionExtraFormSchema = z.object({ productId: z.string().optional(), name: z.string().optional(), unit: z.string().trim().max(20).optional(), quantity: z.coerce.number().min(0.001).max(100_000).multipleOf(0.001) })
  .transform((value) => ({ ...value, productId: value.productId || undefined, name: value.name || undefined })).refine((value) => Boolean(value.productId || value.name), { path: ["name"], message: "Choose a product or give a name" });

export const sessionPaymentFormSchema = z.object({
  reference: z.string().min(1).max(100), mode: z.enum(["new", "existing"]), expenseId: z.string().optional(),
  payee: z.string().max(64).optional(), amountCents: z.coerce.number().int().min(1).max(100_000_000).optional(),
  date: z.iso.date().optional(), shopId: z.string().optional(), category: z.string().optional(), method: z.enum(["card", "cash", "meal_voucher", "wire_transfer", "other"]).optional(),
  payerType: z.enum(["joint", "person"]).optional(), payerId: z.string().optional(), accountId: z.string().optional(), paidBy: z.string().optional(), receiptId: z.string().optional(),
}).superRefine((input, ctx) => {
  const required = input.mode === "existing" ? ["expenseId"] : ["payee", "amountCents", "date", "category", "method", "payerType", ...(input.payerType === "person" ? ["payerId"] : [])];
  for (const name of required) if (!input[name as keyof typeof input]) ctx.addIssue({ code: "custom", path: [name], message: i18n.t("common:form.required") });
});

export const sessionStartFormSchema = z.object({
  destination: z.string().regex(/^(shop|group):.+$/),
  operationId: z.string().min(1).max(160),
});

/** Adjusting a checklist row never navigates or records an acquisition. */
export async function sessionsAction({ request, params }: ActionFunctionArgs): Promise<FormResult | Response> {
  const form = await request.formData();
  // A shopping trip is also a convenient place to create or link catalogue
  // products. These forms use the same handlers as the main catalogue.
  if (form.get("intent") === "create-product" || form.get("intent") === "update-product")
    return handleProductForm(form);
  if (form.get("intent") === "link-alternative" || form.get("intent") === "unlink-alternative")
    return handleProductAlternativeForm(form);
  if (form.get("intent") === "start-session") {
    const { data: input, errors } = parseForm(sessionStartFormSchema, form);
    if (errors) return { errors };
    const group = input.destination.startsWith("group:");
    const id = input.destination.slice(group ? 6 : 5);
    try {
      const session = await startShoppingSession({ selection: "matching", operationId: input.operationId,
        shopIds: group ? [] : [id], shopGroupId: group ? id : undefined, requirementIds: [], includeLowStock: true });
      await recordSelection(group ? "shop_group" : "shop", id).catch(() => undefined);
      return redirect(`/shopping/sessions/${session.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError) return toFormResult(error);
      return { formError: i18n.t("common:errors.generic") };
    }
  }
  if (form.get("intent") === "record-payment" && params.sessionId) {
    const { data: input, errors } = parseForm(sessionPaymentFormSchema, form);
    if (errors) return { errors };
    try {
      await recordSessionPayment(params.sessionId, { reference: input.reference, receiptId: input.receiptId,
        expenseId: input.mode === "existing" ? input.expenseId : undefined,
        expense: input.mode === "existing" ? undefined : { payee: input.payee!, amountCents: input.amountCents!, dueDate: input.date!, paidOn: input.date!, category: input.category as ExpenseCategory, paymentMethod: input.method!, payerType: input.payerType!, payerHabitantId: input.payerId, shares: [], kind: "other", candidateToCancel: false, shopId: input.shopId },
        paymentAccountId: input.accountId, paidByHabitantId: input.paidBy });
      return { ok: true };
    } catch (error) { return toFormResult(error); }
  }
  if (form.get("intent") === "add-extra" && params.sessionId) {
    const { data: input, errors } = parseForm(sessionExtraFormSchema, form);
    if (errors) return { errors };
    try { await addSessionItem(params.sessionId, input); return { ok: true }; }
    catch (error) { return toFormResult(error); }
  }
  if (form.get("intent") !== "adjust-item" || !params.sessionId) return { formError: "Unknown shopping action" };
  const { data: input, errors } = parseForm(sessionAdjustFormSchema, form);
  if (errors) return { errors };
  try {
    await updateSessionItem(params.sessionId, String(form.get("itemId") ?? ""), input);
    return { ok: true };
  } catch (error) {
    // Keep the dialog and its values open after conflicts or validation failures.
    if (error instanceof ApiRequestError && error.status === 409) return { formError: i18n.t("shopping:sessions.adjustConflict") };
    if (error instanceof ApiRequestError) return toFormResult(error);
    return { formError: i18n.t("common:errors.generic") };
  }
}
