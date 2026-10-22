import { BarcodeIcon, ExternalLinkIcon, PencilIcon, PlusIcon, QrCodeIcon, ShoppingCartIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "./card";
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
import { ProductLinkFormDialog } from "./product-link-form-dialog";

type ProductCardProps = {
  product: Product;
  shops: Shop[];
  canManage: boolean;
  initialSelections?: UseSelectionsOptions["initial"];
  /** The catalogue (alternatives: the shared-stock badge and linking in the edit dialog). */
  products?: Product[];
};

/**
 * A catalogue product as a tile (two per row on a phone): its codes and the shops that sell it (price,
 * webshop link), where managers add, edit and remove shop links.
 */
export function ProductCard({ product, shops, canManage, initialSelections, products }: ProductCardProps) {
  const { t } = useTranslation("shopping");
  const actions = useProductActions(product);
  const locale = currentLocale();
  const shopsById = new Map(shops.map((shop) => [shop.id, shop]));
  const defaultShop = product.defaultShopId ? shopsById.get(product.defaultShopId) : undefined;
  const { shopLinks } = actions;

  return (
    <Card className={cn("gap-3 p-4 transition-opacity", actions.deleting && "opacity-60")} aria-busy={actions.busy || undefined}>
      <div className="flex items-start justify-between gap-2">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-lg border bg-white object-contain" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section">
            <ProductCategoryIcon category={product.category} className="size-5" />
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-1"
          aria-label={t("products.addToList", { name: product.name })}
          title={t("products.addToList", { name: product.name })}
          loading={actions.addingToList}
          onClick={actions.addToList}
        >
          <ShoppingCartIcon />
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="leading-tight font-semibold break-words">{product.name}</h3>
        <span><ProductEssentialBadge isEssential={product.isEssential} /></span>
        <span className="text-xs text-muted-foreground">
          {[t(`categories.${product.category}`), product.unit].filter(Boolean).join(" · ")}
        </span>
        {(product.barcode || product.qrCode || product.stockProductId || product.alternatives.length > 0) && (
          <span className="flex min-w-0 flex-wrap gap-1.5">
            <SharedStockBadge product={product} products={products} />
            {product.barcode && (
              <Badge variant="outline" className="max-w-full gap-1 font-normal tabular-nums">
                <BarcodeIcon aria-hidden="true" />
                <span className="truncate">{product.barcode}</span>
              </Badge>
            )}
            {product.qrCode && (
              <Badge variant="outline" className="max-w-full gap-1 font-normal">
                <QrCodeIcon aria-hidden="true" />
                <span className="truncate">{product.qrCode}</span>
              </Badge>
            )}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("products.links")}</span>
        {shopLinks.length === 0 && !defaultShop ? (
          <span className="text-sm text-muted-foreground">{t("products.noLinks")}</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {defaultShop && !shopLinks.some((link) => link.shopId === defaultShop.id) && (
              <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <ShopBadge shop={defaultShop} className="max-w-full" />
                <span className="text-xs text-muted-foreground">{t("products.defaultShopBadge")}</span>
              </li>
            )}
            {shopLinks.map((link) => {
              const shop = shopsById.get(link.shopId) ?? link.shop;
              return (
                <li key={link.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <ShopBadge shop={shop} className="max-w-full" />
                  {link.shopId === product.defaultShopId && (
                    <span className="text-xs text-muted-foreground">{t("products.defaultShopBadge")}</span>
                  )}
                  <span className="flex flex-1 items-center justify-end gap-0.5">
                    {link.priceCents !== null && <span className="mr-1 tabular-nums">{formatCurrency(link.priceCents, locale)}</span>}
                    {link.url && (
                      <Button asChild variant="ghost" size="icon-xs" className="text-muted-foreground">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t("item.openLink")} title={t("item.openLink")}>
                          <ExternalLinkIcon />
                        </a>
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <ProductLinkFormDialog
                          product={product}
                          link={link}
                          shops={shops}
                          trigger={
                            <Button variant="ghost" size="icon-xs" aria-label={t("products.editLink", { shop: link.shop.name })}>
                              <PencilIcon />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("products.deleteLink", { shop: link.shop.name })}
                          onClick={() => actions.removeLink(link.shopId)}
                        >
                          <XIcon />
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canManage && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
          <ProductLinkFormDialog
            product={product}
            shops={shops}
            initialSelections={initialSelections}
            trigger={
              <Button variant="outline" size="sm">
                <PlusIcon />
                {t("products.addLink")}
              </Button>
            }
          />
          <span className="flex-1" />
          <ProductActions product={product} shops={shops} products={products} onDelete={actions.deleteProduct} initialSelections={initialSelections} />
        </div>
      )}
    </Card>
  );
}
