import i18n from "i18next";
import { data, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { ApiRequestError } from "../lib/api-client";
import { parseForm, toFormResult, type FormResult } from "../lib/forms";
import { shopFormSchema } from "../types/shops";
import { createShop, deleteShop, fetchShop, fetchShops, refreshShopIcon, setShopIngredientSearch, updateShop } from "./shops-requests";

export const SHOP_INTENTS = ["create", "update", "delete", "refresh-icon", "ingredient-search"] as const;
export type ShopIntent = (typeof SHOP_INTENTS)[number];

export type ShopActionResult = FormResult & { intent?: ShopIntent; shopId?: string };

export function shopsLoader() {
  return fetchShops();
}

export async function shopLoader({ params }: LoaderFunctionArgs) {
  try {
    return await fetchShop(params.shopId ?? "");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) throw data(null, { status: 404 });
    throw error;
  }
}

async function handleShopForm(formData: FormData): Promise<ShopActionResult> {
  const intent = formData.get("intent") as ShopIntent | null;
  const id = String(formData.get("id") ?? "");

  try {
    if (intent === "delete") {
      await deleteShop(id);
      return { ok: true, intent, shopId: id };
    }
    if (intent === "refresh-icon") {
      await refreshShopIcon(id);
      return { ok: true, intent, shopId: id };
    }
    if (intent === "ingredient-search") {
      await setShopIngredientSearch(id, formData.get("enabled") === "true");
      return { ok: true, intent, shopId: id };
    }

    const { data: input, errors } = parseForm(shopFormSchema, formData);
    if (errors) return { errors, intent: intent ?? undefined };

    const shop = intent === "update" ? await updateShop(id, input) : await createShop(input);
    return { ok: true, intent: intent ?? "create", shopId: shop.id };
  } catch (error) {
    return {
      ...toFormResult(
        error,
        intent === "refresh-icon"
          ? { icon_not_found: i18n.t("shops:icon.notFound"), conflict: i18n.t("shops:icon.noWebsite") }
          : intent === "ingredient-search"
            ? { conflict: i18n.t("shops:ingredientSearch.needsWebshop"), forbidden: i18n.t("shops:ingredientSearch.forbidden") }
            : { conflict: i18n.t("shops:delete.builtIn"), forbidden: i18n.t("shops:errors.forbidden") },
      ),
      intent: intent ?? undefined,
    };
  }
}

/** Shops page: the form's `intent` field says what to do. */
export async function shopsAction({ request }: ActionFunctionArgs): Promise<ShopActionResult> {
  return handleShopForm(await request.formData());
}

/** Shop detail page: same as the list, but deleting goes back to the list. */
export async function shopAction({ request }: ActionFunctionArgs) {
  const result = await handleShopForm(await request.formData());
  if (result.ok && result.intent === "delete") return redirect("/shops");
  return result;
}
