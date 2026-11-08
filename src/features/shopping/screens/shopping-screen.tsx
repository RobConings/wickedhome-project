import { useShoppingSort } from "../data/use-shopping-sort";
import { ShoppingSortField } from "../components/shopping-sort-field";
import { ShoppingNavigation } from "../components/shopping-navigation";
import { useCategoryOrder } from "../data/use-category-order";
import { AutomaticShoppingFilter, CategoryOrder } from "../components/shopping-preferences";
import { currentLocale } from "@/lib/i18n";
import * as React from "react";
import { PackageIcon, PencilIcon, PlusIcon, SearchXIcon, ShoppingCartIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { ScrollRow } from "@/components/layout/scroll-row";
import { Stack } from "@/components/layout/stack";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { SearchField } from "@/components/shared/search-field";
import { useShopSelections } from "@/features/shops";
import { useOpenRequestFromUrl } from "@/lib/open-from-url";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import type { AddShoppingItemInput } from "../components/add-shopping-item-form";
import { AddShoppingItemDialog } from "../components/add-shopping-item-dialog";
import { ShopSummaryList } from "../components/shop-summary-list";
import { ShoppingItemList } from "../components/shopping-item-list";
import { ShoppingGuidance } from "../components/shopping-guidance";
import { filterShopViewItems, NO_SHOP_VIEW_FILTERS, parseStockFilter } from "../components/shopping-grouping";
import { shoppingListViews } from "../types/shopping-list-views";
import { shoppingItemListIds } from "../types/shopping-product-rows";
import { ShoppingStockFilterField } from "../components/shopping-stock-filter";
import { ShoppingItemFormDialog } from "../components/shopping-item-form-dialog";
import { ShoppingListFormDialog } from "../components/shopping-list-form-dialog";
import { StapleFormDialog } from "../components/staple-form-dialog";
import { StapleList } from "../components/staple-list";
import type { ShoppingActionResult, ShoppingPageData } from "../data/shopping-loaders";
import { createShoppingItem } from "../data/shopping-requests";
import { useLiveRevalidation } from "../data/use-live-shopping";
import { useProductSelections } from "../data/use-product-selections";
import { useShoppingItemActions } from "../data/use-shopping-item-actions";
import type { LinkPreview, ShoppingItem } from "../types/shopping";

type ShoppingScreenProps = {
  data: ShoppingPageData;
  /** Lists, staples and products: adults and owners. Everyone adds items and ticks them off. */
  canManage: boolean;
  /** Seed picker favourites (stories). */
  initialSelections?: { products?: UseSelectionsOptions["initial"]; shops?: UseSelectionsOptions["initial"] };
  /** Reads pasted links; defaults to the API (stories). */
  previewLink?: (url: string) => Promise<LinkPreview>;
  /** Refresh interval in ms; `null` turns polling off (stories). */
  refreshIntervalMs?: number | null;
};

/** All shopping lists: add items, tick them off, see where to buy them, and manage weekly staples. */
export function ShoppingScreen({ data, canManage, initialSelections, previewLink, refreshIntervalMs = 30_000 }: ShoppingScreenProps) {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation();
  const { overview, shops, products } = data;
  const { order, change } = useCategoryOrder();
  const [includeLowStock, setIncludeLowStock] = React.useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<ShoppingActionResult>();
  const productSelections = useProductSelections({ initial: initialSelections?.products });
  const shopSelections = useShopSelections({ initial: initialSelections?.shops });
  useLiveRevalidation(refreshIntervalMs);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.formError) toast.error(fetcher.data.formError);
  }, [fetcher.state, fetcher.data]);

  const revalidate = React.useCallback(() => void revalidator.revalidate(), [revalidator]);
  const actions = useShoppingItemActions({ items: overview.items, onChanged: revalidate });
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null);

  // The quick action opens a fresh dialog, including when this page is already showing.
  const addRequest = useOpenRequestFromUrl();

  const activeListId = searchParams.get("list");
  const listViews = shoppingListViews(overview.lists, t("listKinds.groceries")).map((list) => ({
    ...list, openCount: actions.items.filter((item) => item.status === "open" && shoppingItemListIds(item).some((id) => list.listIds.includes(id))).length,
  }));
  const activeView = listViews.find((list) => list.listIds.includes(activeListId ?? "")) ?? null;
  const activeList = activeView?.editableList ?? null;
  const productFilterId = searchParams.get("productId");
  const productFilter = products.find((product) => product.id === productFilterId);
  const productOwner = productFilter?.stockProductId ?? productFilter?.id;
  const familyIds = new Set(products.filter((product) => (product.stockProductId ?? product.id) === productOwner).map((product) => product.id));
  const query = searchParams.get("q") ?? "";
  const searching = query.trim() !== "";
  const locale = currentLocale();
  const { sort, changeSort } = useShoppingSort();
  const stockFilter = parseStockFilter(searchParams.get("stock"));
  const filtering = searching || stockFilter !== "all" || Boolean(productFilterId);
  const visibleItems = filterShopViewItems(actions.items, { ...NO_SHOP_VIEW_FILTERS, query, stock: stockFilter, includeLowStock })
    .filter((item) => !productFilterId || Boolean(item.productId && familyIds.has(item.productId)))
    .filter((item) => !activeView || shoppingItemListIds(item).some((id) => activeView.listIds.includes(id)));
  const totalOpen = actions.items.filter((item) => item.status === "open").length;

  const search = (value: string) =>
    setSearchParams(
      (params) => {
        if (value.trim()) params.set("q", value);
        else params.delete("q");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  const selectList = (id: string | null) =>
    setSearchParams(
      (params) => {
        if (id) params.set("list", id);
        else params.delete("list");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  async function add(input: AddShoppingItemInput) {
    try {
      await createShoppingItem({ ...input, listId: activeView?.id, source: "manual" });
      if (input.productId) void productSelections.recordUse(input.productId);
      if (input.shopId) void shopSelections.recordUse(input.shopId);
      revalidate();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const listsToShow = activeView ? [activeView] : listViews;
  const itemsOf = (listIds: string[]) => visibleItems.filter((item) => activeView
    ? shoppingItemListIds(item).some((id) => listIds.includes(id))
    : listIds.includes(item.listId));

  const headerActions = (
    <>
      <Button asChild variant="outline">
        <Link to="/shopping/products">
          <PackageIcon />
          {t("actions.products")}
        </Link>
      </Button>
      {canManage && (
        <ShoppingListFormDialog
          trigger={
            <Button variant="outline">
              <PlusIcon />
              {t("actions.newList")}
            </Button>
          }
        />
      )}
      <AddShoppingItemDialog
        key={addRequest ?? "idle"}
        defaultOpen={addRequest !== null}
        products={products}
        shops={shops}
        onAdd={add}
        previewLink={previewLink}
        initialSelections={initialSelections}
      />
    </>
  );

  const chip = (id: string | null, label: string, count: number) => (
    <button
      key={id ?? "all"}
      type="button"
      aria-pressed={activeView?.id === id || (!activeView && id === null)}
      onClick={() => selectList(id)}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        (id === null ? !activeView : activeView?.id === id)
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:bg-accent",
      )}
    >
      {label}
      <span className="text-xs tabular-nums opacity-80">{count}</span>
    </button>
  );

  return (
    <PageContainer className="gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {actions.confirmation}
      <PageHeader title={t("page.title")} description={t("page.description")} actions={headerActions} />
      <ShoppingNavigation />
      {productFilterId && <Button variant="secondary" className="self-start" onClick={() => setSearchParams((params) => { params.delete("productId"); return params; }, { preventScrollReset: true })}><PackageIcon />{productFilter?.name ?? t("picker.product")} · {tCommon("list.clearSearch")}</Button>}

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg" className="gap-3 sm:gap-6">
          {listViews.length > 1 && (
            <ScrollRow label={t("lists.filterLabel")} focusable={false}>
              {chip(null, t("lists.all"), totalOpen)}
              {listViews.map((list) => chip(list.id, list.name, list.openCount))}
            </ScrollRow>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField className="flex-1" value={query} onValueChange={search} label={t("lists.searchLabel")} placeholder={t("lists.search")} />
            <AutomaticShoppingFilter included={includeLowStock} onChange={setIncludeLowStock} />
            <CategoryOrder order={order} onChange={change} />
          </div>
          <ShoppingSortField value={sort} onChange={changeSort} />
          <ShoppingStockFilterField value={stockFilter} onChange={(value) => setSearchParams((params) => {
              if (value === "all") params.delete("stock"); else params.set("stock", value);
              return params;
            }, { replace: true, preventScrollReset: true })} />

          {filtering && (
            <p role="status" className="text-sm text-muted-foreground">
              {tCommon("list.results", { count: visibleItems.length })}
            </p>
          )}

          {totalOpen > 0 && !filtering && <ShoppingGuidance />}

          {filtering && visibleItems.length === 0 ? (
            <EmptyState
              icon={SearchXIcon}
              title={searching ? tCommon("list.noResultsTitle", { query: query.trim() }) : tCommon("list.noResultsFilteredTitle")}
              description={tCommon("list.noResultsDescription")}
              action={<Button variant="outline" onClick={() => setSearchParams((params) => {
                params.delete("q"); params.delete("stock"); return params;
              }, { replace: true, preventScrollReset: true })}>{t("shopView.filters.clear")}</Button>}
            />
          ) : overview.lists.length === 0 || (totalOpen === 0 && actions.items.length === 0) ? (
            <EmptyState icon={ShoppingCartIcon} title={t("lists.emptyAll")} />
          ) : (
            listsToShow.map((list) => {
              const items = itemsOf(list.listIds);
              if ((!activeView || filtering) && items.length === 0) return null;
              return (
                <PageSection key={list.id} aria-labelledby={`list-${list.id}`} className="gap-2">
                  <SectionHeader
                    id={`list-${list.id}`}
                    className="[&_h2]:text-sm sm:[&_h2]:text-base"
                    title={
                      <span className="flex items-baseline gap-2">
                        {list.name}
                        <span className="text-sm font-normal text-muted-foreground">
                          {t("lists.openCount", { count: items.filter((item) => item.status === "open").length })}
                        </span>
                      </span>
                    }
                    actions={
                      canManage &&
                      activeList && (
                        <>
                          <ShoppingListFormDialog
                            list={activeList}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={t("actions.editList")} title={t("actions.editList")}>
                                <PencilIcon />
                              </Button>
                            }
                          />
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={t("listForm.deleteTitle", { name: list.name })}>
                                <Trash2Icon />
                              </Button>
                            }
                            title={t("listForm.deleteTitle", { name: list.name })}
                            description={t("listForm.deleteDescription")}
                            confirmLabel={tCommon("actions.delete")}
                            cancelLabel={tCommon("actions.cancel")}
                            destructive
                            onConfirm={async () => {
                              await fetcher.submit({ intent: "delete-list", id: list.id }, { method: "post" });
                              selectList(null);
                            }}
                          />
                        </>
                      )
                    }
                  />
                  <ShoppingItemList
                    items={sort === "name" ? [...items].sort((a, b) => a.name.localeCompare(b.name, locale)) : items}
                    groupByCategory={sort === "category"}
                    groupByNeed={sort === "category"}
                    shops={shops}
                    onToggle={(item) => void actions.toggle(item)}
                    onSkip={(item) => void actions.skip(item)}
                    onDelete={canManage ? (item) => void actions.remove(item) : undefined}
                    onEdit={canManage ? setEditing : undefined}
                    emptyText={t("lists.empty")}
                  />
                </PageSection>
              );
            })
          )}
        </Stack>

        <Stack gap="lg" className="gap-3 sm:gap-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle>{t("shops.title")}</CardTitle>
                <CardDescription>{t("shops.description")}</CardDescription>
              </div>
            </CardHeader>
            {totalOpen > 0 ? (
              <ShopSummaryList items={actions.items} shops={shops} savedGroups={data.shopGroups} className="-mx-2" />
            ) : (
              <p className="text-sm text-muted-foreground">{t("shopView.nothingAnywhere")}</p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle>{t("staples.title")}</CardTitle>
                <CardDescription>{t("staples.description")}</CardDescription>
              </div>
              {canManage && overview.lists.length > 0 && (
                <StapleFormDialog
                  lists={overview.lists}
                  products={products}
                  shops={shops}
                  defaultListId={activeList?.id ?? overview.lists.find((list) => list.kind === "groceries")?.id}
                  initialSelections={initialSelections}
                  trigger={
                    <Button variant="outline" size="icon-sm" aria-label={t("actions.addStaple")} title={t("actions.addStaple")}>
                      <PlusIcon />
                    </Button>
                  }
                />
              )}
            </CardHeader>
            <StapleList
              staples={overview.staples}
              lists={overview.lists}
              products={products}
              shops={shops}
              canManage={canManage}
              initialSelections={initialSelections}
            />
          </Card>
        </Stack>
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
