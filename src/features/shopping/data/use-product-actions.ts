import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { Product } from "../types/shopping";
import type { ShoppingActionResult } from "./shopping-loaders";

/**
 * The quick actions on a catalogue product (products page action): put it on the list, remove a shop link,
 * delete it. Shared by the product's row and tile. Toasts when it went on the list or something failed.
 */
export function useProductActions(product: Product) {
  const { t } = useTranslation("shopping");
  const fetcher = useFetcher<ShoppingActionResult>();
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  // What is being saved right now: the matching button spins, a removed link disappears straight away
  // (and comes back if removing fails).
  const busyIntent = fetcher.formData?.get("intent");
  const removingShopId = busyIntent === "delete-link" ? fetcher.formData?.get("shopId") : null;

  React.useEffect(() => {
    if (result?.ok && result.intent === "add-to-list") toast.success(t("products.addedToList", { name: product.name }));
    else if (result?.formError) toast.error(result.formError);
  }, [result, product.name, t]);

  return {
    busy: fetcher.state !== "idle",
    addingToList: busyIntent === "add-to-list",
    deleting: busyIntent === "delete-product",
    /** The product's shop links without the one being removed. */
    shopLinks: product.shopLinks.filter((link) => link.shopId !== removingShopId),
    addToList: () => void fetcher.submit({ intent: "add-to-list", id: product.id }, { method: "post" }),
    removeLink: (shopId: string) => void fetcher.submit({ intent: "delete-link", id: product.id, shopId }, { method: "post" }),
    /** Returns the promise, so a confirm dialog stays busy until it is done. */
    deleteProduct: () => fetcher.submit({ intent: "delete-product", id: product.id }, { method: "post" }),
  };
}
