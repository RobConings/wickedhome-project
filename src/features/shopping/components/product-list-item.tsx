import { ShoppingCartIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ShopBadge, type Shop } from "@/features/shops";
import { formatCurrency } from "../lib/format";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import { useProductActions } from "../data/use-product-actions";
import type { Product } from "../types/shopping";
import { ProductActions } from "./product-actions";
import { ProductEssentialBadge } from "./product-essential-badge";
import { SharedStockBadge } from "./product-alternatives";
import { ProductCategoryIcon } from "./product-category-icon";

type ProductListItemProps = {
  product: Product;
  shops: Shop[];
  canManage: boolean;
  initialSelections?: UseSelectionsOptions["initial"];
  /** The catalogue (alternatives: the shared-stock badge and linking in the edit dialog). */
  products?: Product[];
};

/**
 * A catalogue product as a row of the list view (the list draws the dividers): category, unit, lowest
 * price and the shops that sell it, with "put on the list", edit and delete. Shop links are managed on the tile.
 */
export function ProductListItem({ product, shops, canManage, initialSelections, products }: ProductListItemProps) {
  const { t } = useTranslation("shopping");
  const actions = useProductActions(product);
  const locale = currentLocale();
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]));
  const { shopLinks } = actions;

  const prices = shopLinks.flatMap((link) => (link.priceCents === null ? [] : [link.priceCents]));
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const defaultShop = product.defaultShopId ? shopsById.get(product.defaultShopId) : undefined;
  const sellers = [
    ...(defaultShop && !shopLinks.some((link) => link.shopId === defaultShop.id) ? [defaultShop] : []),
    ...shopLinks.map((link) => shopsById.get(link.shopId) ?? link.shop),
  ];

  return (
    <div
      className={cn("flex items-center gap-3 transition-opacity", actions.deleting && "opacity-60")}
      aria-busy={actions.busy || undefined}
    >
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className="size-10 shrink-0 rounded-lg border bg-white object-contain" />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-section-soft text-section">
          <ProductCategoryIcon category={product.category} className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{product.name}</span>
        <span><ProductEssentialBadge isEssential={product.isEssential} /></span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            t(`categories.${product.category}`),
            product.unit,
            lowestPrice !== null && t("products.priceFrom", { price: formatCurrency(lowestPrice, locale) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {(sellers.length > 0 || product.stockProductId || product.alternatives.length > 0) && (
          <span className="flex min-w-0 flex-wrap gap-1">
            <SharedStockBadge product={product} products={products} />
            {sellers.map((shop) => (
              <ShopBadge key={shop.id} shop={shop} className="max-w-full" />
            ))}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("products.addToList", { name: product.name })}
        title={t("products.addToList", { name: product.name })}
        loading={actions.addingToList}
        onClick={actions.addToList}
      >
        <ShoppingCartIcon />
      </Button>
      {canManage && (
        <ProductActions product={product} shops={shops} products={products} onDelete={actions.deleteProduct} initialSelections={initialSelections} />
      )}
    </div>
  );
}
