import * as React from "react";
import {
  BarcodeIcon, BoxesIcon, ExternalLinkIcon, HistoryIcon, LinkIcon, PackageIcon,
  PencilIcon, PlusIcon, QrCodeIcon, ShoppingCartIcon, StoreIcon, TagIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/layout/page-container";
import { Card, CardTitle } from "@/components/shared/card";
import { IconChip } from "@/components/shared/icon-chip";
import { PageHeader } from "@/components/shared/page-header";
import { RecordLink } from "@/components/shared/record-link";
import { RecordImage } from "@/components/shared/record-image";
import { formatCurrency } from "@/lib/format";
import { withRecordOrigin } from "@/lib/record-navigation";
import { RecordWorkspaceTabs } from "@/components/shared/record-workspace-tabs";
import { SplitAction } from "@/components/shared/split-action";
import {
  LinkAlternativeDialog, ProductAlternatives, ProductCategoryIcon,
  ProductFormDialog, createShoppingItem, fetchShoppingItems, formatQuantity,
} from "@/features/shopping";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { StockItemFormDialog } from "../components/stock-item-form-dialog";
import { StockItemRow } from "../components/stock-item-row";
import { StockMovementList } from "../components/stock-movement-list";
import type { ProductStockPageData } from "../data/inventory-loaders";
import { productAlreadyOnList } from "../types/product-workspace";
import { useStockActions } from "../data/use-stock-actions";

type ProductStockScreenProps = {
  data: ProductStockPageData;
  canManage: boolean;
  context?: React.ReactNode;
  attachments?: React.ReactNode;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; places?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
};

const productPath = (id: string) => `/inventory/products/${encodeURIComponent(id)}`;

/**
 * Phase C: a product-first workspace instead of a per-location stock administration page.
 * No stock/history/API contracts change; existing location records remain editable in Advanced stock.
 * The shared Details/Overview grammar leaves each owning feature free to compose its own content.
 */
export function ProductStockScreen({ data, canManage, initialSelections, context, attachments }: ProductStockScreenProps) {
  const { t } = useTranslation("inventory");
  const { t: tCommon } = useTranslation();
  const { t: tShopping } = useTranslation("shopping");
  const { product, stock, places, shops, products, highlightId } = data;
  const locale = currentLocale();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const onChanged = React.useCallback(() => revalidator.revalidate(), [revalidator]);
  const { adjust, isPending, show, confirmation } = useStockActions({ onChanged });

  const stockItems = stock.stockItems.map(show);
  const total = stockItems.reduce((sum, item) => sum + item.quantity, 0);
  const unit = stockItems[0]?.unit ?? product.unit;
  const mixedUnits = new Set(stockItems.map((item) => item.unit ?? product.unit ?? "")).size > 1;
  const availablePlaces = places.filter((place) => !stock.stockItems.some((item) => item.placeId === place.id));
  const preferredShop = shops.find((shop) => shop.id === product.defaultShopId)?.name ?? null;

  const [editOpen, setEditOpen] = React.useState(false);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [stockDetailsOpen, setStockDetailsOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  function showDetails() {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("workspace");
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  function showStockManagement() {
    showDetails();
    setStockDetailsOpen(true);
  }

  function openAdjust() {
    // If several historical stock locations exist, let the user choose rather than guessing.
    if (places.length === 0 || stockItems.length > 1 || (stockItems.length === 0 && availablePlaces.length === 0)) {
      showStockManagement();
    } else {
      setAdjustOpen(true);
    }
  }

  async function addToShopping() {
    if (adding) return;
    setAdding(true);
    try {
      const existingItems = await fetchShoppingItems({ status: "open" });
      const alreadyListed = productAlreadyOnList(product.id, products, existingItems);
      if (alreadyListed) {
        toast.info(t("workspace.alreadyOnShopping"));
        navigate(withRecordOrigin(`/shopping?productId=${encodeURIComponent(product.id)}`, `${location.pathname}${location.search}${location.hash}`));
        return;
      }
      await createShoppingItem({
        productId: product.id, quantity: 1, unit: product.unit ?? undefined,
        shopId: product.defaultShopId, source: "manual",
      });
      toast.success(t("workspace.addedToShopping"));
      onChanged();
    } catch {
      toast.error(t("workspace.addToShoppingFailed"));
    } finally {
      setAdding(false);
    }
  }

  const count = stockItems.length === 0 ? "—" : mixedUnits ? t("workspace.mixedUnits") : `${formatQuantity(total, locale)}${unit ? ` ${unit}` : ""}`;
  const packageSize = product.packageAmount !== null && product.packageUnit
    ? `${formatQuantity(product.packageAmount, locale)} ${product.packageUnit}`
    : null;
  const onlyStockItem = stockItems.length === 1 ? stockItems[0] : undefined;
  const minimum = onlyStockItem?.minQuantity ?? null;
  const stockPlace = onlyStockItem?.placeName ?? null;
  const stockStatus = stockItems.length === 0 ? t("workspace.notTracked")
    : total === 0 ? t("workspace.outOfStock")
    : stockItems.some((item) => item.isLow) ? t("stock.low") : t("workspace.inStock");
  const detailRows: { label: string; value: string }[] = [
    { label: t("workspace.category"), value: tShopping(`categories.${product.category}`) },
    { label: t("workspace.storage"), value: stockPlace ?? (stockItems.length > 1 ? t("workspace.multipleLocations") : t("workspace.notSet")) },
    { label: t("workspace.minStock"), value: stockItems.length > 1 && stockItems.some((item) => item.minQuantity !== null)
      ? t("workspace.minimumByLocation") : minimum === null ? t("workspace.notSet") : `${formatQuantity(minimum, locale)}${unit ? ` ${unit}` : ""}` },
    { label: t("workspace.preferredShop"), value: preferredShop ?? t("workspace.notSet") },
    { label: t("workspace.essential"), value: product.isEssential ? t("workspace.yes") : t("workspace.no") },
  ];

  const stats = [
    { id: "stock", icon: PackageIcon, tone: "success" as const, value: count, label: t("workspace.inStock") },
    { id: "alternatives", icon: LinkIcon, tone: "info" as const, value: product.alternatives.length, label: t("workspace.alternatives") },
    { id: "shops", icon: StoreIcon, tone: "shopping" as const, value: product.shopLinks.length, label: t("workspace.linkedShops") },
    { id: "history", icon: HistoryIcon, tone: "tasks" as const, value: stock.movements.length, label: t("workspace.stockChanges") },
  ];

  const actionButtons = (
    <div className="grid min-w-0 grid-cols-1 gap-2 xl:flex xl:flex-wrap xl:justify-end">
      <SplitAction
        icon={ShoppingCartIcon}
        label={t("workspace.addToShopping")}
        menuLabel={t("workspace.moreActions")}
        busy={adding}
        onClick={() => void addToShopping()}
        menu={
          <>
            {canManage && <DropdownMenuItem onSelect={openAdjust}><BoxesIcon />{t("workspace.adjustStock")}</DropdownMenuItem>}
            <DropdownMenuItem asChild><RecordLink to="/inventory/scan"><BarcodeIcon />{t("actions.scan")}</RecordLink></DropdownMenuItem>
            {canManage && <DropdownMenuItem asChild><RecordLink to={`/inventory/count?productId=${encodeURIComponent(product.id)}`}><BoxesIcon />{t("count.title")}</RecordLink></DropdownMenuItem>}
            {canManage && <DropdownMenuItem onSelect={showStockManagement}><HistoryIcon />{t("workspace.stockSettings")}</DropdownMenuItem>}
          </>
        }
      />
      {canManage && (
        <SplitAction
          icon={PencilIcon}
          label={t("workspace.editProduct")}
          menuLabel={t("workspace.moreManagement")}
          onClick={() => setEditOpen(true)}
          variant="outline"
          menu={
            <>
              <DropdownMenuItem onSelect={() => setLinkOpen(true)}><LinkIcon />{t("workspace.linkAlternative")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={showStockManagement}><BoxesIcon />{t("workspace.stockSettings")}</DropdownMenuItem>
            </>
          }
        />
      )}
    </div>
  );

  return (
    <PageContainer>
      {confirmation}
      <div data-slot="product-hero" className="rounded-xl border bg-card p-3 shadow-xs sm:p-5">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <RecordImage src={product.imageUrl} alt={product.name} shape="banner" fit="contain"
            className="h-56 sm:h-56 lg:h-72" fallback={<ProductCategoryIcon category={product.category} className="size-20 text-section" />} />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <PageHeader
                backTo="/inventory"
                title={product.name}
                description={
                  <span className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline">{stockStatus}</Badge>
                    {product.isEssential && <Badge variant="outline">{t("workspace.essential")}</Badge>}
                    {preferredShop && <Badge variant="outline">{preferredShop}</Badge>}
                  </span>
                }
                className="min-w-0 xl:flex-1"
              />
              <div data-slot="product-desktop-actions" className="hidden min-w-0 xl:block xl:max-w-[58%]">{actionButtons}</div>
            </div>
            <div data-slot="product-statistics" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {stats.map(({ id, icon, tone, value, label }) => (
                <div key={id} className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-2.5 sm:p-3">
                  <IconChip icon={icon} tone={tone} size="sm" />
                  <div className="min-w-0">
                    <p className="break-words text-lg font-semibold leading-tight tabular-nums">{value}</p>
                    <p className="break-words text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>
            {/* On phones the actions follow the product facts, just like the approved mobile wireframe. */}
            <div data-slot="product-mobile-actions" className="min-w-0 xl:hidden">{actionButtons}</div>
          </div>
        </div>
      </div>

      <RecordWorkspaceTabs
        label={t("workspace.navigation")}
        detailsLabel={t("workspace.details")}
        overviewLabel={t("workspace.overview")}
        details={
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-3">
              <div className="flex items-center gap-2"><IconChip icon={BarcodeIcon} tone="info" size="sm" /><CardTitle>{t("workspace.productInfo")}</CardTitle></div>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { icon: BarcodeIcon, label: t("workspace.barcode"), value: product.barcode },
                  ...(product.qrCode ? [{ icon: QrCodeIcon, label: t("workspace.qrCode"), value: product.qrCode }] : []),
                  { icon: PackageIcon, label: t("workspace.packSize"), value: packageSize },
                  { icon: BoxesIcon, label: t("workspace.stockUnit"), value: mixedUnits ? t("workspace.mixedUnits") : unit },
                  { icon: TagIcon, label: t("workspace.brand"), value: product.brand },
                  { icon: StoreIcon, label: t("workspace.preferredShop"), value: preferredShop },
                ].map(({ icon, label, value }) => {
                  const Icon = icon;
                  return <div key={label} className="min-w-0 rounded-lg bg-muted/40 p-3">
                    <dt className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4 shrink-0 text-section" aria-hidden="true" />{label}</dt>
                    <dd className="mt-1 break-words font-medium">{value || t("workspace.notSet")}</dd>
                  </div>;
                })}
              </dl>
            </Card>
            <Card className="gap-3">
              <div className="flex items-center gap-2"><IconChip icon={TagIcon} tone="shopping" size="sm" /><CardTitle>{t("workspace.productDetails")}</CardTitle></div>
              <dl className="divide-y">
                {detailRows.map(({ label, value }) => <div key={label} className="grid min-w-0 grid-cols-2 gap-3 py-2.5 text-sm">
                  <dt className="break-words text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd>
                </div>)}
              </dl>
              <div className="flex items-center gap-2 border-t pt-4"><IconChip icon={PencilIcon} tone="tasks" size="sm" /><CardTitle>{t("workspace.notes")}</CardTitle></div>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{product.notes || t("workspace.noNotes")}</p>
            </Card>
            <Card className="gap-3" id="product-stock-management">
              <button type="button" aria-expanded={stockDetailsOpen} className="flex w-full items-center justify-between gap-3 text-left font-semibold" onClick={() => setStockDetailsOpen((value) => !value)}>
                <span className="inline-flex items-center gap-2"><IconChip icon={BoxesIcon} tone="info" size="sm" />{t("workspace.advancedStock")}</span>
                <span className="text-xs font-normal text-muted-foreground">{stockDetailsOpen ? t("workspace.collapse") : t("workspace.expand")}</span>
              </button>
              {stockDetailsOpen && <div className="flex flex-col gap-3">
                {stockItems.length ? <ul className="divide-y">{stockItems.map((item) => <StockItemRow
                  key={item.id}
                  item={item}
                  showProduct={false}
                  pending={isPending(item.id)}
                  onAdjust={(target, delta) => void adjust(target, delta, delta < 0 ? "scan_use" : "scan_add")}
                  actions={canManage && <StockItemFormDialog stockItem={item} products={[product]} places={places}
                    trigger={<button type="button" className="min-h-11 rounded-lg px-2 text-sm underline">{tCommon("actions.edit")}</button>} />}
                />)}</ul> : <p className="text-sm text-muted-foreground">{t("detail.notKept")}</p>}
                {canManage && availablePlaces.length > 0 && <StockItemFormDialog
                  products={[product]} places={availablePlaces} defaults={{ productId: product.id }}
                  initialSelections={initialSelections}
                  trigger={<button type="button" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border px-3 text-sm"><PlusIcon className="size-4" />{t("actions.keepAt")}</button>}
                />}
              </div>}
            </Card>
          </div>
        }
        overview={
          <div className="flex min-w-0 flex-col gap-4">
            {context}
            {attachments && <section id="product-documents" className="scroll-mt-20">{attachments}</section>}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="flex items-center gap-2"><IconChip icon={StoreIcon} tone="shopping" size="sm" /><CardTitle>{t("workspace.linkedShops")} ({product.shopLinks.length})</CardTitle></div>
                {product.shopLinks.length ? <ul className="divide-y">
                  {product.shopLinks.map((link) => <li key={link.id} className="py-1">
                    <RecordLink to={`/shops/${encodeURIComponent(link.shopId)}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:underline">
                      <span className="min-w-0 truncate font-medium">{link.shop.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{link.priceCents === null ? "" : formatCurrency(link.priceCents, locale)}</span>
                    </RecordLink>
                    {link.articleNumber && <p className="break-words text-xs text-muted-foreground">{t("workspace.articleNumber", { number: link.articleNumber })}</p>}
                    {link.url && /^https?:\/\//i.test(link.url) && <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"><ExternalLinkIcon className="size-4 shrink-0" aria-hidden="true" />{t("workspace.openOffer", { shop: link.shop.name })}</a>}
                  </li>)}
                </ul> : <p className="text-sm text-muted-foreground">{t("workspace.noLinkedShops")}</p>}
              </Card>
              <Card>
                <div className="flex items-center gap-2"><IconChip icon={LinkIcon} tone="info" size="sm" /><CardTitle>{tShopping("alternatives.title")}</CardTitle></div>
                <ProductAlternatives product={product} products={products} canManage={canManage} highlightId={highlightId}
                  productHref={productPath} initialSelections={initialSelections?.products} />
              </Card>
              <Card id="product-stock-history" className="scroll-mt-20">
                <div className="flex items-center gap-2"><IconChip icon={HistoryIcon} tone="tasks" size="sm" /><CardTitle>{t("history.title")}</CardTitle></div>
                <StockMovementList movements={stock.movements} showPlace={stockItems.length > 1} />
              </Card>
            </div>
          </div>
        }
      />

      <ProductFormDialog product={product} shops={shops} products={products} initialSelections={initialSelections?.shops}
        open={editOpen} onOpenChange={setEditOpen} onSaved={onChanged} />
      <LinkAlternativeDialog product={product} products={products} initialSelections={initialSelections?.products}
        open={linkOpen} onOpenChange={setLinkOpen} onLinked={onChanged} />
      {canManage && places.length > 0 && <StockItemFormDialog
        stockItem={stockItems.length === 1 ? stockItems[0] : undefined}
        products={[product]}
        places={stockItems.length === 1 ? places : availablePlaces}
        defaults={stockItems.length === 0 ? { productId: product.id } : undefined}
        initialSelections={initialSelections}
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        onSaved={onChanged}
      />}
    </PageContainer>
  );
}
