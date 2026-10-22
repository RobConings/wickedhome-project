import i18n from "i18next";
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { fetchPlaces, type Place } from "@/features/places";
import { fetchProduct, fetchProducts, handleProductAlternativeForm, handleProductForm, type Product } from "@/features/shopping";
import { fetchShops, type Shop } from "@/features/shops";
import { failedAction, type FormResult, formString, parseForm } from "@/lib/forms";
import { notFoundAs404 } from "@/lib/loaders";
import { stockItemInputSchema, stockItemUpdateFormSchema, type ProductStock, type StockItem } from "../types/inventory";
import { createStockItem, deleteStockItem, fetchProductStock, fetchStock, updateStockItem } from "./inventory-requests";

export type InventoryPageData = { stock: StockItem[]; products: Product[]; places: Place[]; shops: Shop[] };
export type ProductStockPageData = {
  product: Product;
  stock: ProductStock;
  places: Place[];
  shops: Shop[];
  /** The catalogue (alternatives: names and the products to link). */
  products: Product[];
  /** The alternative whose page was opened (`?from=`): highlighted among the alternatives. */
  highlightId: string | null;
};
export type ScanPageData = { products: Product[]; places: Place[]; shops: Shop[] };

export type InventoryActionResult = FormResult & { intent?: string; id?: string; addedToShoppingList?: boolean };

export async function inventoryLoader(): Promise<InventoryPageData> {
  const [stock, products, places, shops] = await Promise.all([fetchStock(), fetchProducts(), fetchPlaces(), fetchShops()]);
  return { stock, products, places, shops };
}

export async function productStockLoader({ params, request }: LoaderFunctionArgs): Promise<ProductStockPageData> {
  const id = params.productId ?? "";
  try {
    const [product, stock, places, shops, products] = await Promise.all([
      fetchProduct(id),
      fetchProductStock(id),
      fetchPlaces(),
      fetchShops(),
      fetchProducts(),
    ]);
    // An alternative's stock is its main product's: show that page, with this brand highlighted.
    if (product.stockProductId) {
      throw redirect(`/inventory/products/${encodeURIComponent(product.stockProductId)}?from=${encodeURIComponent(product.id)}`);
    }
    const from = new URL(request.url).searchParams.get("from");
    return { product, stock, places, shops, products, highlightId: from };
  } catch (error) {
    return notFoundAs404(error);
  }
}

export async function scanLoader(): Promise<ScanPageData> {
  const [products, places, shops] = await Promise.all([fetchProducts(), fetchPlaces(), fetchShops()]);
  return { products, places, shops };
}

/** Inventory pages: stock items (create/update/delete) and products from the scan screen. */
export async function inventoryAction({ request }: ActionFunctionArgs): Promise<InventoryActionResult> {
  const formData = await request.formData();
  const intent = formString(formData, "intent");
  const id = formString(formData, "id");
  try {
    switch (intent) {
      case "create-product":
      case "update-product":
        return await handleProductForm(formData);
      case "link-alternative":
      case "unlink-alternative":
        return await handleProductAlternativeForm(formData);
      case "create-stock": {
        const { data: input, errors } = parseForm(stockItemInputSchema, formData);
        if (errors) return { errors, intent };
        const item = await createStockItem(input);
        return { ok: true, intent, id: item.id };
      }
      case "update-stock": {
        const { data: input, errors } = parseForm(stockItemUpdateFormSchema, formData);
        if (errors) return { errors, intent };
        const result = await updateStockItem(id, input);
        return { ok: true, intent, id, addedToShoppingList: result.addedToShoppingList };
      }
      case "delete-stock":
        await deleteStockItem(id);
        return { ok: true, intent, id };
      default:
        return { formError: i18n.t("inventory:errors.generic"), intent };
    }
  } catch (error) {
    return failedAction(error, intent, {
        conflict: i18n.t("inventory:errors.alreadyKept"),
        forbidden: i18n.t("inventory:errors.forbidden"),
      });
  }
}
