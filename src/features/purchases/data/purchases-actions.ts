import i18n from "i18next";
import type { ActionFunctionArgs } from "react-router";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import { goodsAllocationFormSchema } from "../types/goods-allocation";
import { saveGoodsAllocation } from "./purchases-requests";

export async function purchasesAction({ request }: ActionFunctionArgs): Promise<FormResult> {
  const form = await request.formData();
  if (form.get("intent") !== "allocate-goods") return { formError: "Unknown purchase action" };
  const { data: input, errors } = parseForm(goodsAllocationFormSchema, form);
  if (errors) return { errors };
  try { await saveGoodsAllocation(String(form.get("acquisitionId") ?? ""), input); return { ok: true }; }
  catch (error) { return toFormResult(error, { conflict: i18n.t("purchases:allocation.conflict") }); }
}
