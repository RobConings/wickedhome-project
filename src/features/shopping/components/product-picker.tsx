import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { EntityPicker, type EntityPickerItem } from "@/components/shared/entity-picker";
import type { UseSelectionsOptions } from "@/lib/selections";
import { useProductSelections } from "../data/use-product-selections";
import type { Product } from "../types/shopping";
import { ProductCategoryIcon } from "./product-category-icon";

type ProductPickerProps = Omit<
  React.ComponentProps<typeof EntityPicker>,
  "items" | "favoriteIds" | "recentIds" | "onToggleFavorite"
> & {
  /** Products to choose from, e.g. from `fetchProducts()`. */
  products: Product[];
  /** Seed favourites/recents instead of fetching them (stories, tests). */
  initialSelections?: UseSelectionsOptions["initial"];
};

/**
 * Choose a product from the household catalogue, with favourites and recently used products on top.
 * Works in a `<Form>` via `name`. After the form saves, call `recordUse(productId)` from `useProductSelections()`.
 */
export function ProductPicker({ products, initialSelections, placeholder, loading, ...props }: ProductPickerProps) {
  const { t } = useTranslation("shopping");
  const selections = useProductSelections({ initial: initialSelections });
  const { favoriteIds, recentIds, toggleFavorite } = selections;

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
    <EntityPicker
      {...props}
      items={items}
      favoriteIds={favoriteIds}
      recentIds={recentIds}
      // Favourites and recents arrive separately from the products: show placeholders until both are known.
      loading={loading || selections.loading}
      onToggleFavorite={(id) => toggleFavorite(id).catch(() => toast.error(t("errors.favorite")))}
      placeholder={placeholder ?? t("picker.product")}
    />
  );
}
