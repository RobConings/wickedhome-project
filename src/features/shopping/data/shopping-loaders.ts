import i18n from "i18next";
import type { ActionFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { fetchShops, type Shop } from "@/features/shops";
import { ApiRequestError } from "@/lib/api-client";
import { parseForm, toFormResult, type FormResult } from "@/lib/forms";
import {
  editToUpdate,
  productAlternativeInputSchema,
  productInputSchema,
  shoppingItemEditSchema,
  productShopLinkInputSchema,
  shoppingListInputSchema,
  stapleInputSchema,
  webUrlSchema,
  type Product,
  type ShoppingOverview,
} from "../types/shopping";
import {
  createProduct,
  createShoppingItem,
  createShoppingList,
  createStaple,
  deleteProduct,
  deleteProductLink,
  deleteShoppingList,
  deleteStaple,
  fetchProducts,
  fetchShoppingOverview,
  linkProductAlternative,
  unlinkProductAlternative,
  updateProduct,
  updateShoppingItem,
  updateShoppingList,
  updateStaple,
  upsertProductLink,
} from "./shopping-requests";

export type ShoppingPageData = { overview: ShoppingOverview; shops: Shop[]; products: Product[] };
export type ProductsPageData = { products: Product[]; shops: Shop[] };

export type ShoppingActionResult = FormResult & { intent?: string; id?: string };

/** Shopping page and shop view: lists, items and staples, with shops and products for the pickers. */
export async function shoppingLoader(): Promise<ShoppingPageData> {
  const [overview, shops, products] = await Promise.all([fetchShoppingOverview(), fetchShops(), fetchProducts()]);
  return { overview, shops, products };
}

/**
 * The shopping loader ignores the URL: switching lists (`?list=`) or shops in the shop view only filters
 * what is already loaded, so those are instant instead of reloading everything. Submits, revalidations
 * and going to the very same URL still reload (and polling keeps the data fresh).
 */
export function shoppingShouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.href !== nextUrl.href) return false;
  return defaultShouldRevalidate;
}

export async function productsLoader(): Promise<ProductsPageData> {
  const [products, shops] = await Promise.all([fetchProducts(), fetchShops()]);
  return { products, shops };
}

const errorMessages = () => ({ forbidden: i18n.t("shopping:errors.forbidden") });

function failed(error: unknown, intent: string | undefined): ShoppingActionResult {
  return { ...toFormResult(error, errorMessages()), intent };
}

/**
 * Creates or updates a product from a `ProductFormDialog` (intents `create-product` / `update-product`).
 * Exported so other pages with the dialog (e.g. the scan screen) can handle it in their own action.
 */
export async function handleProductForm(formData: FormData): Promise<ShoppingActionResult> {
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  try {
    const { data, errors } = parseForm(productInputSchema, formData);
    if (errors) return { errors, intent };
    // The form's webshop link (one shop: the URL's own shop or the default shop), checked before anything is saved.
    const link = productLinkFromForm(formData);
    if (link && "error" in link) return { errors: { linkUrl: [link.error] }, intent };
    const product = intent === "update-product" ? await updateProduct(id, data) : await createProduct(data);
    if (link) {
      const existing = product.shopLinks.find((candidate) => candidate.shopId === link.shopId);
      await upsertProductLink(product.id, { shopId: link.shopId, url: link.url, priceCents: link.priceCents ?? existing?.priceCents ?? null, articleNumber: existing?.articleNumber ?? null });
    }
    // The field was cleared (the form asked first): that shop's link goes.
    const removeShopId = String(formData.get("removeLinkShopId") ?? "");
    if (!link && removeShopId) await deleteProductLink(product.id, removeShopId);
    return { ok: true, intent, id: product.id };
  } catch (error) {
    return failed(error, intent);
  }
}

/** The product form's link fields: nothing, a link to save, or an error message for the field. */
function productLinkFromForm(formData: FormData): { url: string; shopId: string; priceCents: number | null } | { error: string } | null {
  const url = String(formData.get("linkUrl") ?? "").trim();
  if (!url) return null;
  if (!webUrlSchema.safeParse(url).success) return { error: i18n.t("shopping:productLink.invalidUrl") };
  const shopId = String(formData.get("linkShopId") ?? "");
  if (!shopId) return { error: i18n.t("shopping:productLink.chooseShop") };
  const cents = Number(formData.get("linkPriceCents"));
  return { url, shopId, priceCents: formData.get("linkPriceCents") && Number.isInteger(cents) && cents >= 0 ? cents : null };
}

/**
 * Links or unlinks a product alternative (shared stock) from `ProductAlternatives` / `LinkAlternativeDialog`
 * (intents `link-alternative`: `id` shares the stock of `mainProductId`; `unlink-alternative`: `id` leaves
 * its group). Exported so every page with those components handles them in its own action.
 */
export async function handleProductAlternativeForm(formData: FormData): Promise<ShoppingActionResult> {
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  try {
    if (intent === "unlink-alternative") {
      await unlinkProductAlternative(id);
      return { ok: true, intent, id };
    }
    // The picker posts `id` (product page) or `mainProductId` (scan screen); either may be left empty.
    const choose = [i18n.t("shopping:alternatives.chooseProduct")];
    if (!id) return { errors: { id: choose }, intent };
    if (!formData.get("mainProductId")) return { errors: { mainProductId: choose }, intent };
    const { data, errors } = parseForm(productAlternativeInputSchema, formData);
    if (errors) return { errors, intent };
    const product = await linkProductAlternative(id, data);
    return { ok: true, intent, id: product.id };
  } catch (error) {
    return failed(error, intent);
  }
}

/**
 * Shopping page and shop view: lists, staples and editing an item (`update-item`, the item dialog). Ticking
 * off and deleting go straight to the API (see useShoppingItemActions).
 */
export async function shoppingAction({ request }: ActionFunctionArgs): Promise<ShoppingActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  try {
    switch (intent) {
      case "create-list":
      case "update-list": {
        const { data, errors } = parseForm(shoppingListInputSchema, formData);
        if (errors) return { errors, intent };
        const result = intent === "update-list" ? await updateShoppingList(id, data) : await createShoppingList(data);
        return { ok: true, intent, id: result.id };
      }
      case "delete-list":
        await deleteShoppingList(id);
        return { ok: true, intent, id };
      case "create-staple":
      case "update-staple": {
        const { data, errors } = parseForm(stapleInputSchema, formData);
        if (errors) return { errors, intent };
        const staple = intent === "update-staple" ? await updateStaple(id, data) : await createStaple(data);
        return { ok: true, intent, id: staple.id };
      }
      case "delete-staple":
        await deleteStaple(id);
        return { ok: true, intent, id };
      case "update-item": {
        const { data, errors } = parseForm(shoppingItemEditSchema, formData);
        if (errors) return { errors, intent };
        await updateShoppingItem(id, editToUpdate(data));
        return { ok: true, intent, id };
      }
      default:
        return { formError: i18n.t("shopping:errors.generic"), intent };
    }
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return { ok: true, intent };
    return failed(error, intent);
  }
}

/** Products page: the catalogue and its shop links. */
export async function productsAction({ request }: ActionFunctionArgs): Promise<ShoppingActionResult> {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const id = String(formData.get("id") ?? "");
  try {
    switch (intent) {
      case "create-product":
      case "update-product":
        return await handleProductForm(formData);
      case "link-alternative":
      case "unlink-alternative":
        return await handleProductAlternativeForm(formData);
      case "delete-product":
        await deleteProduct(id);
        return { ok: true, intent, id };
      case "upsert-link": {
        const { data, errors } = parseForm(productShopLinkInputSchema, formData);
        if (errors) return { errors, intent };
        await upsertProductLink(id, data);
        return { ok: true, intent, id };
      }
      case "delete-link":
        await deleteProductLink(id, String(formData.get("shopId") ?? ""));
        return { ok: true, intent, id };
      case "add-to-list":
        await createShoppingItem({ productId: id, source: "manual" });
        return { ok: true, intent, id };
      default:
        return { formError: i18n.t("shopping:errors.generic"), intent };
    }
  } catch (error) {
    return failed(error, intent);
  }
}
