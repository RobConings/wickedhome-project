import * as React from "react";
import { useTranslation } from "react-i18next";
import { type EntityPickerItem } from "@/components/shared/entity-picker";
import type { Product } from "../types/shopping";
import { ProductCategoryIcon } from "./product-category-icon";
import { SelectionsPicker, type SelectionsPickerBaseProps } from "@/components/shared/selections-picker";

type ProductPickerProps = SelectionsPickerBaseProps & {
  /** Products to choose from, e.g. from `fetchProducts()`. */
  products: Product[];
};

/**
 * Choose a product from the household catalogue, with favourites and recently used products on top.
 * Works in a `<Form>` via `name`. After the form saves, call `recordUse(productId)` from `useProductSelections()`.
 */
export function ProductPicker({ products, placeholder, ...props }: ProductPickerProps) {
  const { t } = useTranslation("shopping");

  const items = React.useMemo<EntityPickerItem[]>(
    () =>
      products.map((product) => ({
        id: product.id,
        label: product.name,
        description: [t(`categories.${product.category}`), product.unit].filter(Boolean).join(" · "),
        leading: <ProductCategoryIcon category={product.category} className="text-muted-foreground" />,
        keywords: [product.barcode, product.qrCode].filter((value): value is string => Boolean(value)),
      })),
    [products, t],
  );

  return (
    <SelectionsPicker
      {...props}
      entityType="product"
      items={items}
      waitForSelections
      favoriteFailedMessage={t("errors.favorite")}
      placeholder={placeholder ?? t("picker.product")}
    />
  );
}
