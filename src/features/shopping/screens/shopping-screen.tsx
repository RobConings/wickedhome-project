import { Text } from "@/components/ui/text";
import { useShoppingSort } from "../data/use-shopping-sort";
import { ShoppingSortField } from "../components/shopping-sort-field";
import { ShoppingNavigation } from "../components/shopping-navigation";
import { useCategoryOrder } from "../data/use-category-order";
import { AutomaticShoppingFilter, CategoryOrder } from "../components/shopping-preferences";
import { currentLocale } from "@/lib/i18n";
import * as React from "react";
import { PackageIcon, PencilIcon, PlusIcon, SearchXIcon, ShoppingCartIcon, SlidersHorizontalIcon, StoreIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher, useRevalidator, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/layout/page-container";
import { PageGrid } from "@/components/layout/page-grid";
import { PageSection } from "@/components/layout/page-section";
import { Stack } from "@/components/layout/stack";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/shared/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { SplitAction } from "@/components/shared/split-action";
import { SearchField } from "@/components/shared/search-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShopSelections } from "@/features/shops";
import { useOpenRequestFromUrl } from "@/lib/open-from-url";
import type { UseSelectionsOptions } from "@/lib/selections";
import type { AddShoppingItemInput } from "../components/add-shopping-item-form";
import { AddShoppingItemDialog } from "../components/add-shopping-item-dialog";
import { SessionStartCard } from "../components/session-start-card";
import { ShopSummaryList } from "../components/shop-summary-list";
import { ShoppingItemList } from "../components/shopping-item-list";
import { ShoppingGuidance } from "../components/shopping-guidance";
import { filterShopViewItems, NO_SHOP_VIEW_FILTERS, parseStockFilter } from "../components/shopping-grouping";
import { shoppingListViews } from "../types/shopping-list-views";
import { shoppingItemListIds } from "../types/shopping-product-rows";
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
import { XtraListPanel } from "../components/xtra-list-panel";
import type { XtraListInitial } from "../data/use-xtra-list";

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
  /** Seed the external list in stories; production reads it separately from household needs. */
  xtraInitial?: XtraListInitial;
};

/** All shopping lists: add items, tick them off, see where to buy them, and manage weekly staples. */
export function ShoppingScreen({ data, canManage, initialSelections, previewLink, refreshIntervalMs = 30_000, xtraInitial }: ShoppingScreenProps) {
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
  const [startOpen, setStartOpen] = React.useState(false);
  const [newListOpen, setNewListOpen] = React.useState(false);
  const [startDestination, setStartDestination] = React.useState<string | null>(null);

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
  const filtering = searching || stockFilter !== "all" || !includeLowStock || Boolean(productFilterId);
  const advancedFilterCount = Number(stockFilter !== "all") + Number(!includeLowStock);
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
    <PageGrid gap="sm" className="w-full min-w-0 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
      {canManage && (
        <SplitAction
          icon={ShoppingCartIcon}
          label={t("sessions.startShopping")}
          menuLabel={t("actions.shoppingMoreActions")}
          onClick={() => setStartOpen(true)}
          menu={
            <>
              <DropdownMenuItem asChild><Link to="/shopping/shops"><StoreIcon />{t("actions.shopView")}</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/shopping/sessions"><ShoppingCartIcon />{t("sessions.history")}</Link></DropdownMenuItem>
            </>
          }
        />
      )}
      <SplitAction
        icon={PlusIcon}
        label={t("actions.addItem")}
        menuLabel={t("actions.shoppingManageActions")}
        variant="outline"
        renderPrimary={(button) => (
          <AddShoppingItemDialog
            key={addRequest ?? "idle"}
            trigger={button}
            defaultOpen={addRequest !== null}
            products={products}
            shops={shops}
            onAdd={add}
            previewLink={previewLink}
            initialSelections={initialSelections}
          />
        )}
        menu={
          <>
            {canManage && <DropdownMenuItem onSelect={() => setNewListOpen(true)}><PlusIcon />{t("actions.newList")}</DropdownMenuItem>}
            <DropdownMenuItem asChild><Link to="/shopping/products"><PackageIcon />{t("actions.products")}</Link></DropdownMenuItem>
          </>
        }
      />
    </PageGrid>
  );

  return (
    <PageContainer className="gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-8 lg:px-8">
      {actions.confirmation}
      {canManage && <ShoppingListFormDialog open={newListOpen} onOpenChange={setNewListOpen} />}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-visible sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sessions.simpleStart")}</DialogTitle>
            <DialogDescription>{t("sessions.simpleDescription")}</DialogDescription>
          </DialogHeader>
          <SessionStartCard
            shopping={data}
            destination={startDestination}
            onDestinationChange={setStartDestination}
            initialSelections={initialSelections && { shops: initialSelections.shops }}
            action="/shopping/sessions"
            compact
          />
        </DialogContent>
      </Dialog>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={headerActions} />
      <ShoppingNavigation />
      {productFilterId && <Button variant="secondary" className="self-start" onClick={() => setSearchParams((params) => { params.delete("productId"); return params; }, { preventScrollReset: true })}><PackageIcon />{productFilter?.name ?? t("picker.product")} · {tCommon("list.clearSearch")}</Button>}

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg" className="gap-3 sm:gap-6">
          <XtraListPanel initial={xtraInitial} intervalMs={refreshIntervalMs} />
          <PageGrid gap="sm" className="min-w-0 grid-cols-[minmax(0,1fr)_auto] sm:flex sm:items-center" role="group" aria-label={t("shopView.filters.label")}>
            {listViews.length > 1 && (
              <Select value={activeView?.id ?? "all"} onValueChange={(value) => selectList(value === "all" ? null : value)}>
                <SelectTrigger className="col-span-2 w-full min-w-0 sm:col-auto sm:w-48" aria-label={t("lists.filterLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("lists.all")} ({totalOpen})</SelectItem>
                  {listViews.map((list) => (
                    <SelectItem key={list.id} value={list.id}>{list.name} ({list.openCount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <SearchField className="min-w-0 sm:flex-1" value={query} onValueChange={search} label={t("lists.searchLabel")} placeholder={t("lists.search")} />
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-10 shrink-0" aria-label={t("shopView.filters.viewOptions")}>
                  <SlidersHorizontalIcon aria-hidden="true" />
                  <span className="hidden sm:inline">{t("shopView.filters.viewOptions")}</span>
                  {advancedFilterCount > 0 && (
                    <span className="rounded-full bg-section-soft px-1.5 text-xs tabular-nums text-section" aria-label={String(advancedFilterCount)}>
                      {advancedFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="max-h-[min(75vh,38rem)] w-80 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto">
                <Stack gap="none">
                  <Text weight="semibold">{t("shopView.filters.viewOptions")}</Text>
                  <Text size="xs" tone="muted">{t("shopView.filters.viewOptionsDescription")}</Text>
                </Stack>
                <Stack gap="1.5">
                  <label className="block text-sm font-medium">{t("shopView.sort.label")}</label>
                  <ShoppingSortField value={sort} onChange={changeSort} />
                </Stack>
                <Stack gap="1.5">
                  <label className="block text-sm font-medium">{t("stockFilter.label")}</label>
                  <Select value={stockFilter} onValueChange={(value) => setSearchParams((params) => {
                    if (value === "all") params.delete("stock"); else params.set("stock", value);
                    return params;
                  }, { replace: true, preventScrollReset: true })}>
                    <SelectTrigger className="w-full" aria-label={t("stockFilter.label")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["all", "out", "low", "nearly_out", "below_minimum", "at_minimum", "above_minimum", "untracked"] as const).map((option) => (
                        <SelectItem key={option} value={option}>{t(`stockFilter.${option}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Stack>
                <AutomaticShoppingFilter included={includeLowStock} onChange={setIncludeLowStock} />
                <CategoryOrder order={order} onChange={change} />
                {totalOpen > 0 && <ShoppingGuidance />}
              </PopoverContent>
            </Popover>
          </PageGrid>

          {filtering && (
            <Text role="status" className="sr-only">
              {tCommon("list.results", { count: visibleItems.length })}
            </Text>
          )}

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
              <Stack gap="xs">
                <CardTitle>{t("shops.title")}</CardTitle>
                <CardDescription>{t("shops.description")}</CardDescription>
              </Stack>
            </CardHeader>
            {totalOpen > 0 ? (
              <ShopSummaryList items={actions.items} shops={shops} savedGroups={data.shopGroups} className="-mx-2" />
            ) : (
              <Text size="sm" tone="muted">{t("shopView.nothingAnywhere")}</Text>
            )}
          </Card>

          <Card>
            <CardHeader>
              <Stack gap="xs">
                <CardTitle>{t("staples.title")}</CardTitle>
                <CardDescription>{t("staples.description")}</CardDescription>
              </Stack>
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
