import { useCategoryOrder } from "../data/use-category-order";
import { AutomaticShoppingFilter, CategoryOrder } from "../components/shopping-preferences";
import * as React from "react";
import { ArrowLeftIcon, CircleHelpIcon, PartyPopperIcon, RefreshCwIcon, SearchXIcon, StoreIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useRevalidator, useSearchParams } from "react-router";
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
import type { AddShoppingItemInput } from "../components/add-shopping-item-form";
import { AddShoppingItemDialog } from "../components/add-shopping-item-dialog";
import { ProductCategoryIcon } from "../components/product-category-icon";
import {
  NO_SHOP_VIEW_FILTERS,
  SHOP_VIEW_SORTS,
  filterShopViewItems,
  groupShopViewItems,
  itemsForShops,
  type ShopViewFilters,
  type ShopViewSort,
} from "../components/shopping-grouping";
import { ShopViewToolbar } from "../components/shop-view-toolbar";
import { ShopSummaryList } from "../components/shop-summary-list";
import { ShoppingItemFormDialog } from "../components/shopping-item-form-dialog";
import { ShoppingItemList } from "../components/shopping-item-list";
import { ShoppingGuidance } from "../components/shopping-guidance";
import { ShopViewSelection } from "../components/shop-view-selection";
import { shoppingListViews } from "../types/shopping-list-views";
import { shoppingItemListIds } from "../types/shopping-product-rows";
import type { ShoppingPageData } from "../data/shopping-loaders";
import { createShoppingItem } from "../data/shopping-requests";
import { LIVE_REFRESH_MS, useLiveRevalidation } from "../data/use-live-shopping";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import { NO_SHOP, PRODUCT_CATEGORIES, estimateTotal, type LinkPreview, type ProductCategory, type ShoppingItem } from "../types/shopping";

type ShopViewScreenProps = {
  data: ShoppingPageData;
  /** A shop id, `none` for items without a shop, or null to choose a shop first. */
  shopKey: string | null;
  canManage?: boolean;
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Refresh interval in ms; `null` turns polling off (stories). */
  refreshIntervalMs?: number | null;
};

/**
 * In the shop: everything to buy here from every list, most urgent first (or by category, name or price),
 * with search, filters and big tick targets. SSE invalidates committed data; polling/focus are fallbacks.
 */
export function ShopViewScreen({
  data,
  shopKey,
  canManage = false,
  initialSelections,
  previewLink,
  refreshIntervalMs = LIVE_REFRESH_MS,
}: ShopViewScreenProps) {
  const { t } = useTranslation("shopping");
  const { overview, shops, products } = data;
  const { order, change } = useCategoryOrder();
  const [includeLowStock, setIncludeLowStock] = React.useState(true);
  const groups = data.shopGroups ?? [];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeGroup = groups.find((group) => group.id === searchParams.get("group"));
  const availableKeys = new Set([NO_SHOP, ...shops.map((shop) => shop.id)]);
  const selectedKeys = [...new Set(activeGroup?.shopIds ?? [...(shopKey ? [shopKey] : []), ...searchParams.getAll("shop")])].filter((key) => availableKeys.has(key));
  const hasSelection = selectedKeys.length > 0;
  const combined = selectedKeys.length > 1;
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

  const shop = selectedKeys.length === 1 && selectedKeys[0] !== NO_SHOP ? (shops.find((candidate) => candidate.id === selectedKeys[0]) ?? null) : null;
  const here = itemsForShops(actions.items, selectedKeys);
  const open = here.filter((item) => item.status === "open");
  const bought = here.filter((item) => item.status === "bought");
  const fallbackName = here.find((item) => item.shop)?.shop?.name;
  // What is still to buy here would cost about this much (items without a price are counted apart).
  const estimate = estimateTotal(open);
  const categories = PRODUCT_CATEGORIES.filter((category) => open.some((item) => (item.category ?? "other") === category));
  const lists = shoppingListViews(overview.lists, t("listKinds.groceries")).filter((list) => open.some((item) => shoppingItemListIds(item).some((id) => list.listIds.includes(id))));
  const activeList = lists.find((list) => list.id === filters.listId);
  const filterItems = (items: ShoppingItem[]) => filterShopViewItems(items, { ...filters, listId: "all", includeLowStock })
    .filter((item) => !activeList || shoppingItemListIds(item).some((id) => activeList.listIds.includes(id)));
  const visibleOpen = filterItems(open);
  const visibleBought = filterItems(bought);
  const title = activeGroup?.name ?? (combined
    ? selectedKeys.map((key) => shops.find((candidate) => candidate.id === key)?.name ?? t("shops.noShop")).join(" + ")
    : selectedKeys[0] === NO_SHOP ? t("shops.noShop") : (shop?.name ?? fallbackName ?? t("shopView.title")));

  const selectShops = (keys: string[]) => {
    const params = new URLSearchParams();
    keys.forEach((key) => params.append("shop", key));
    void navigate(`/shopping/shops?${params}`);
  };
  const selectGroup = (id: string) => void navigate(`/shopping/shops?group=${encodeURIComponent(id)}`);
  const selection = <ShopViewSelection compact={hasSelection} shops={shops} groups={groups} selectedKeys={selectedKeys} activeGroupId={activeGroup?.id} canManage={canManage} onSelect={selectShops} onSelectGroup={selectGroup} onSaved={async () => { await revalidator.revalidate(); }} />;

  async function add(input: AddShoppingItemInput) {
    try {
      await createShoppingItem({ ...input, shopId: shop?.id ?? input.shopId, source: "manual" });
      revalidate();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const addAction = <AddShoppingItemDialog
    key={selectedKeys.join("|")}
    products={products}
    shops={shops}
    onAdd={add}
    fixedShopId={shop?.id}
    previewLink={previewLink}
    initialSelections={initialSelections}
  />;

  const back = (
    <Link to={hasSelection ? "/shopping/shops" : "/shopping"} className="inline-flex items-center gap-1 hover:underline">
      <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
      {hasSelection ? t("shopView.title") : t("actions.backToShopping")}
    </Link>
  );

  if (!hasSelection) {
    const anything = actions.items.some((item) => item.status === "open");
    return (
      <PageContainer className="gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {actions.confirmation}
        <PageHeader eyebrow={back} title={t("shopView.title")} description={t("shopView.description")} actions={addAction} />
        <div className="mb-6 max-w-xl">{selection}</div>
        {anything ? (
          <Card className="max-w-xl">
            <CardTitle>{t("shopView.chooseShop")}</CardTitle>
            <ShopSummaryList items={actions.items} shops={shops} savedGroups={groups} className="-mx-2" />
          </Card>
        ) : (
          <EmptyState icon={StoreIcon} title={t("shopView.nothingAnywhere")} />
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer className="gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {actions.confirmation}
      <PageHeader
        eyebrow={back}
        actions={addAction}
        title={
          <span className="flex items-center gap-3">
            {shop ? (
              <ShopLogo shop={shop} size="lg" className="size-8 sm:size-11" />
            ) : (
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-section-soft text-section">
                <CircleHelpIcon className="size-6" aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 break-words">{title}</span>
          </span>
        }
        className="[&_h1]:text-xl sm:[&_h1]:text-2xl"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {here.length > 0 && <span className="tabular-nums">{t("shopView.progress", { bought: bought.length, total: here.length })}</span>}
            {estimate.priced > 0 && <span className="tabular-nums">{t("shopView.estimate", { total: formatCurrency(estimate.cents, locale) })}</span>}
            <span title={t("shopView.liveHint")}><RefreshCwIcon className="size-3" aria-label={t("shopView.liveHint")} /></span>
          </span>
        }
      />

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg" className="gap-3 sm:gap-6">
          {selection}
          <AutomaticShoppingFilter included={includeLowStock} onChange={setIncludeLowStock} />
          <CategoryOrder order={order} onChange={change} />
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
            groupShopViewItems(visibleOpen, sort, order).map((group) => {
              const list = (
                <ShoppingItemList
                  groupByCategory={false}
                  items={group.items}
                  shops={shops}
                  size="large"
                  showShop={combined}
                  showStockStatus={sort !== "priority"}
                  onToggle={(item) => void actions.toggle(item)}
                    onSkip={(item) => void actions.skip(item)}
                  onDelete={canManage ? (item) => void actions.remove(item) : undefined}
                  onEdit={setEditing}
                />
              );
              if (group.key === "all") return <React.Fragment key="all">{list}</React.Fragment>;
              return (
                <PageSection key={group.key} aria-labelledby={`aisle-${group.key}`} className="gap-2">
                  <SectionHeader
                    id={`aisle-${group.key}`}
                    className="[&_h2]:text-sm sm:[&_h2]:text-base"
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
            <ShoppingItemList
              items={visibleBought}
              shops={shops}
              size="large"
              showShop={combined}
              onToggle={(item) => void actions.toggle(item)}
                    onSkip={(item) => void actions.skip(item)}
              onDelete={canManage ? (item) => void actions.remove(item) : undefined}
            />
          )}
        </Stack>

        <Card className="max-lg:hidden">
          <CardTitle>{t("shopView.chooseShop")}</CardTitle>
          <ShopSummaryList items={actions.items} shops={shops} activeKey={shop?.id ?? (selectedKeys[0] === NO_SHOP && !combined ? NO_SHOP : undefined)} savedGroups={groups} activeGroupId={activeGroup?.id} className="-mx-2" />
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

/** The sort picked before on this device; name until then (or when storage is unavailable). */
function readStoredSort(): ShopViewSort {
  try {
    const stored = globalThis.localStorage?.getItem(SORT_STORAGE_KEY);
    return (SHOP_VIEW_SORTS as readonly string[]).includes(stored ?? "") ? (stored as ShopViewSort) : "category";
  } catch {
    return "category";
  }
}

function storeSort(sort: ShopViewSort) {
  try {
    globalThis.localStorage?.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    // Not remembered on this device; the view still sorts.
  }
}
