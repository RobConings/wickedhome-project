import * as React from "react";
import { ArrowLeftIcon, BarcodeIcon, MapPinIcon, PencilIcon, PlusIcon, QrCodeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageContainer } from "../components/page-container";
import { PageGrid } from "../components/page-grid";
import { Stack } from "../components/stack";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/card";
import { PageHeader } from "../components/page-header";
import { ProductAlternatives, ProductCategoryIcon, ProductFormDialog, formatQuantity } from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { StockItemFormDialog } from "../components/stock-item-form-dialog";
import { StockItemRow } from "../components/stock-item-row";
import { StockMovementList } from "../components/stock-movement-list";
import type { ProductStockPageData } from "../data/inventory-loaders";
import { useStockActions } from "../data/use-stock-actions";

type ProductStockScreenProps = {
  data: ProductStockPageData;
  canManage: boolean;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; places?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
};

const productPath = (productId: string) => `/inventory/products/${encodeURIComponent(productId)}`;

/**
 * One product: where it is kept, how much, its minimums, the history of every change, and its alternatives
 * (other brands sharing this stock; an alternative's page redirects here with that brand highlighted).
 */
export function ProductStockScreen({ data, canManage, initialSelections }: ProductStockScreenProps) {
  const { t } = useTranslation("inventory");
  const { t: tCommon } = useTranslation();
  const { t: tShopping } = useTranslation("shopping");
  const { product, stock, places, shops, products, highlightId } = data;
  const locale = currentLocale();
  const revalidator = useRevalidator();
  const onChanged = React.useCallback(() => revalidator.revalidate(), [revalidator]);
  const { adjust, isPending, show } = useStockActions({ onChanged });
  // Quick −1 / +1 show at once (also in the total) while they are saved.
  const stockItems = stock.stockItems.map(show);
  const total = stockItems.reduce((sum, item) => sum + item.quantity, 0);
  const unit = stock.stockItems[0]?.unit ?? product.unit;
  const keptAt = new Set(stock.stockItems.map((item) => item.placeId));
  const freePlaces = places.filter((place) => !keptAt.has(place.id));

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link to="/inventory" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            {t("page.title")}
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" referrerPolicy="no-referrer" className="size-11 shrink-0 rounded-lg border bg-white object-contain" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section">
                <ProductCategoryIcon category={product.category} className="size-6" />
              </span>
            )}
            <span className="min-w-0 break-words">{product.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="font-medium text-foreground tabular-nums">
              {t("detail.total", { quantity: `${formatQuantity(total, locale)}${unit ? ` ${unit}` : ""}` })}
            </span>
            {product.barcode && (
              <Badge variant="outline" className="gap-1 font-normal tabular-nums">
                <BarcodeIcon aria-hidden="true" />
                {product.barcode}
              </Badge>
            )}
            {product.qrCode && (
              <Badge variant="outline" className="gap-1 font-normal">
                <QrCodeIcon aria-hidden="true" />
                {product.qrCode}
              </Badge>
            )}
          </span>
        }
        actions={
          canManage && (
            <>
              <ProductFormDialog
                product={product}
                shops={shops}
                initialSelections={initialSelections?.shops}
                trigger={
                  <Button variant="outline">
                    <PencilIcon />
                    {tCommon("actions.edit")}
                  </Button>
                }
              />
              {freePlaces.length > 0 && (
                <StockItemFormDialog
                  products={[product]}
                  places={freePlaces}
                  defaults={{ productId: product.id }}
                  initialSelections={initialSelections}
                  trigger={
                    <Button>
                      <PlusIcon />
                      {t("actions.keepAt")}
                    </Button>
                  }
                />
              )}
            </>
          )
        }
      />

      <PageGrid columns="main-sidebar" className="items-start">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle>{t("detail.places")}</CardTitle>
              <CardDescription>{t("detail.placesDescription")}</CardDescription>
            </div>
          </CardHeader>
          {stockItems.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPinIcon className="size-4" aria-hidden="true" />
              {t("detail.notKept")}
            </p>
          ) : (
            <ul className="-my-2 divide-y">
              {stockItems.map((item) => (
                <StockItemRow
                  key={item.id}
                  item={item}
                  showProduct={false}
                  pending={isPending(item.id)}
                  onAdjust={(target, delta) => void adjust(target, delta, delta < 0 ? "scan_use" : "scan_add")}
                  actions={
                    canManage && (
                      <StockItemFormDialog
                        stockItem={item}
                        products={[product]}
                        places={places}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={t("actions.edit", { name: item.placeName })} title={t("actions.edit", { name: item.placeName })}>
                            <PencilIcon />
                          </Button>
                        }
                      />
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Stack gap="lg">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle>{tShopping("alternatives.title")}</CardTitle>
                <CardDescription>{tShopping("alternatives.description")}</CardDescription>
              </div>
            </CardHeader>
            <ProductAlternatives
              product={product}
              products={products}
              canManage={canManage}
              highlightId={highlightId}
              productHref={productPath}
              initialSelections={initialSelections?.products}
            />
          </Card>
          <Card>
            <CardTitle>{t("history.title")}</CardTitle>
            <StockMovementList movements={stock.movements} showPlace={stock.stockItems.length > 1} />
          </Card>
          {/* TODO(inventory): print own QR labels for products and places (sheet of codes like "WH-P-…"
              that map to Product.qrCode). Scanning such a label already works through the qrCode field. */}
        </Stack>
      </PageGrid>
    </PageContainer>
  );
}
