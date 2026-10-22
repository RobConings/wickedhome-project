import * as React from "react";
import { ArrowLeftIcon, CircleHelpIcon, PartyPopperIcon, RefreshCwIcon, SearchXIcon, StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useRevalidator } from "react-router";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { Card, CardTitle } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { ShopLogo } from "@/features/shops";
import { formatCurrency } from "@/lib/format";
import { currentLocale } from "@/lib/i18n";
import type { UseSelectionsOptions } from "@/lib/selections";
import { AddShoppingItemForm, type AddShoppingItemInput } from "../components/add-shopping-item-form";
import { ProductCategoryIcon } from "../components/product-category-icon";
import {
  NO_SHOP_VIEW_FILTERS,
  SHOP_VIEW_SORTS,
  filterShopViewItems,
  groupShopViewItems,
  isShopKey,
  type ShopViewFilters,
  type ShopViewSort,
} from "../components/shopping-grouping";
import { ShopViewToolbar } from "../components/shop-view-toolbar";
import { ShopSummaryList } from "../components/shop-summary-list";
import { ShoppingItemFormDialog } from "../components/shopping-item-form-dialog";
import { ShoppingItemList } from "../components/shopping-item-list";
import { ShoppingGuidance } from "../components/shopping-guidance";
import type { ShoppingPageData } from "../data/shopping-loaders";
import { createShoppingItem } from "../data/shopping-requests";
import { LIVE_REFRESH_MS, useLiveRevalidation } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import { NO_SHOP, PRODUCT_CATEGORIES, estimateTotal, type LinkPreview, type ProductCategory, type ShoppingItem } from "../types/shopping";

type ShopViewScreenProps = {
  data: ShoppingPageData;
  /** A shop id, `none` for items without a shop, or null to choose a shop first. */
  shopKey: string | null;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Refresh interval in ms; `null` turns polling off (stories). */
  refreshIntervalMs?: number | null;
};

/**
 * In the shop: everything to buy here from every list, most urgent first (or by category, name or price),
 * with search, filters and big tick targets. Refreshes every ~10 s and on focus, so two phones shopping together stay in sync.
 */
export function ShopViewScreen({
  data,
  shopKey,
  initialSelections,
  previewLink,
  refreshIntervalMs = LIVE_REFRESH_MS,
}: ShopViewScreenProps) {
  const { t } = useTranslation("shopping");
  const { overview, shops, products } = data;
  const revalidator = useRevalidator();
  useLiveRevalidation(refreshIntervalMs);
  const revalidate = React.useCallback(() => void revalidator.revalidate(), [revalidator]);
  const actions = useShoppingItemActions({ items: overview.items, onChanged: revalidate });
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null);
  const locale = currentLocale();
  const [sort, setSort] = React.useState<ShopViewSort>(readStoredSort);
  const [filters, setFilters] = React.useState<ShopViewFilters>(NO_SHOP_VIEW_FILTERS);
  const changeSort = (next: ShopViewSort) => {
    setSort(next);
    storeSort(next);
  };

  const shop = shopKey && shopKey !== NO_SHOP ? (shops.find((candidate) => candidate.id === shopKey) ?? null) : null;
  const here = shopKey ? actions.items.filter((item) => isShopKey(shopKey, item)) : [];
  const open = here.filter((item) => item.status === "open");
  const bought = here.filter((item) => item.status === "bought");
  const fallbackName = here.find((item) => item.shop)?.shop?.name;
  // What is still to buy here would cost about this much (items without a price are counted apart).
  const estimate = estimateTotal(open);
  const categories = PRODUCT_CATEGORIES.filter((category) => open.some((item) => (item.category ?? "other") === category));
  const lists = [...new Map(open.map((item) => [item.listId, { id: item.listId, name: item.listName }])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const visibleOpen = filterShopViewItems(open, filters);
  const visibleBought = filterShopViewItems(bought, filters);
  const title = shopKey === NO_SHOP ? t("shops.noShop") : (shop?.name ?? fallbackName ?? t("shopView.title"));

  async function add(input: AddShoppingItemInput) {
    try {
      await createShoppingItem({ ...input, shopId: shop?.id ?? input.shopId, source: "manual" });
      revalidate();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const back = (
    <Link to={shopKey ? "/shopping/shops" : "/shopping"} className="inline-flex items-center gap-1 hover:underline">
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      {shopKey ? t("shopView.title") : t("actions.backToShopping")}
    </Link>
  );

  if (!shopKey) {
    const anything = actions.items.some((item) => item.status === "open");
    return (
      <PageContainer>
        <PageHeader eyebrow={back} title={t("shopView.title")} description={t("shopView.description")} />
        {anything ? (
          <Card className="max-w-xl">
            <CardTitle>{t("shopView.chooseShop")}</CardTitle>
            <ShopSummaryList items={actions.items} shops={shops} className="-mx-2" />
          </Card>
        ) : (
          <EmptyState icon={StoreIcon} title={t("shopView.nothingAnywhere")} />
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow={back}
        title={
          <span className="flex items-center gap-3">
            {shop ? (
              <ShopLogo shop={shop} size="lg" className="size-11" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section">
                <CircleHelpIcon className="size-6" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 break-words">{title}</span>
          </span>
        }
        description={
          <span className="flex flex-col gap-1 pt-1">
            {shopKey === NO_SHOP && <span>{t("shopView.noShopDescription")}</span>}
            {here.length > 0 && (
              <span className="font-medium text-foreground tabular-nums">
                {t("shopView.progress", { bought: bought.length, total: here.length })}
              </span>
            )}
            {open.length > 0 && (
              <span className="text-foreground tabular-nums">
                {estimate.priced > 0
                  ? t("shopView.estimate", { total: formatCurrency(estimate.cents, locale) })
                  : t("shopView.noPrices")}
                {estimate.priced > 0 && estimate.unpriced > 0 && (
                  <span className="text-muted-foreground"> · {t("shopView.unpriced", { count: estimate.unpriced })}</span>
                )}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs">
              <RefreshCwIcon className="size-3" aria-hidden="true" />
              {t("shopView.liveHint")}
            </span>
          </span>
        }
      />

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg">
          {open.length > 0 && <ShoppingGuidance />}
          {open.length > 0 && (
            <ShopViewToolbar
              sort={sort}
              onSortChange={changeSort}
              filters={filters}
              onFiltersChange={setFilters}
              categories={categories}
              lists={lists}
            />
          )}
          {open.length === 0 ? (
            <EmptyState icon={PartyPopperIcon} title={t("shopView.empty")} description={here.length > 0 ? t("shopView.emptyDescription") : undefined} />
          ) : visibleOpen.length === 0 ? (
            <EmptyState icon={SearchXIcon} title={t("shopView.filters.noResults")} description={t("shopView.filters.noResultsDescription")} />
          ) : (
            groupShopViewItems(visibleOpen, sort).map((group) => {
              const list = (
                <ShoppingItemList
                  items={group.items}
                  shops={shops}
                  size="large"
                  showShop={false}
                  showList
                  onToggle={(item) => void actions.toggle(item)}
                  onEdit={setEditing}
                />
              );
              if (group.key === "all") return <React.Fragment key="all">{list}</React.Fragment>;
              return (
                <PageSection key={group.key} aria-labelledby={`aisle-${group.key}`}>
                  <SectionHeader
                    id={`aisle-${group.key}`}
                    title={
                      <span className="flex items-center gap-2">
                        {sort === "category" ? (
                          <>
                            <ProductCategoryIcon category={group.key as ProductCategory} className="size-5 text-primary" />
                            {group.key === "other" ? t("shopView.otherItems") : t(`categories.${group.key}`)}
                          </>
                        ) : (
                          t(`shopView.tiers.${group.key}`)
                        )}
                        <span className="text-sm font-normal text-muted-foreground">{group.items.length}</span>
                      </span>
                    }
                  />
                  {list}
                </PageSection>
              );
            })
          )}
          {visibleBought.length > 0 && (
            <ShoppingItemList items={visibleBought} shops={shops} size="large" showShop={false} showList onToggle={(item) => void actions.toggle(item)} />
          )}
          <Card className="p-4">
            <AddShoppingItemForm
              products={products}
              shops={shops}
              onAdd={add}
              fixedShopId={shop?.id}
              previewLink={previewLink}
              initialSelections={initialSelections}
            />
          </Card>
        </Stack>

        <Card className="max-lg:hidden">
          <CardTitle>{t("shopView.chooseShop")}</CardTitle>
          <ShopSummaryList items={actions.items} shops={shops} activeKey={shopKey} className="-mx-2" />
        </Card>
      </PageGrid>
      <ShoppingItemFormDialog
        item={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        products={products}
        shops={shops}
        previewLink={previewLink}
        onSaved={revalidate}
      />
    </PageContainer>
  );
}

const SORT_STORAGE_KEY = "wh-shop-view-sort";

/** The sort picked before on this device; priority until then (or when storage is unavailable). */
function readStoredSort(): ShopViewSort {
  try {
    const stored = globalThis.localStorage?.getItem(SORT_STORAGE_KEY);
    return (SHOP_VIEW_SORTS as readonly string[]).includes(stored ?? "") ? (stored as ShopViewSort) : "priority";
  } catch {
    return "priority";
  }
}

function storeSort(sort: ShopViewSort) {
  try {
    globalThis.localStorage?.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    // Not remembered on this device; the view still sorts.
  }
}
