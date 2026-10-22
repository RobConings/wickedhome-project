import * as React from "react";
import { PackageIcon, PencilIcon, PlusIcon, ShoppingCartIcon, StoreIcon, Trash2Icon } from "lucide-react";
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
import { DeleteConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionHeader } from "@/components/shared/section-header";
import { useShopSelections } from "@/features/shops";
import { useOpenRequestFromUrl } from "@/lib/open-from-url";
import type { UseSelectionsOptions } from "@/lib/selections";
import { cn } from "@/lib/utils";
import { AddShoppingItemForm, type AddShoppingItemInput } from "../components/add-shopping-item-form";
import { ShopSummaryList } from "../components/shop-summary-list";
import { ShoppingItemList } from "../components/shopping-item-list";
import { ShoppingGuidance } from "../components/shopping-guidance";
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
import { useFetcherErrorToast } from "@/lib/hooks/use-fetcher-result";

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
  const { overview, shops, products } = data;
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<ShoppingActionResult>();
  const productSelections = useProductSelections({ initial: initialSelections?.products });
  const shopSelections = useShopSelections({ initial: initialSelections?.shops });
  useLiveRevalidation(refreshIntervalMs);

  useFetcherErrorToast(fetcher);

  const revalidate = React.useCallback(() => void revalidator.revalidate(), [revalidator]);
  const actions = useShoppingItemActions({ items: overview.items, onChanged: revalidate });
  const [editing, setEditing] = React.useState<ShoppingItem | null>(null);

  // `?new=1` (the "Add shopping item" quick action) puts the cursor in "Add an item"; the param is removed at
  // once. Each request remounts the form (a new key), so it also focuses when this page is already showing.
  const addRequest = useOpenRequestFromUrl();

  const activeListId = searchParams.get("list");
  const activeList = overview.lists.find((list) => list.id === activeListId) ?? null;
  const totalOpen = actions.items.filter((item) => item.status === "open").length;

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
      await createShoppingItem({ ...input, listId: activeList?.id, source: "manual" });
      if (input.productId) void productSelections.recordUse(input.productId);
      if (input.shopId) void shopSelections.recordUse(input.shopId);
      revalidate();
    } catch (error) {
      toast.error(t("errors.generic"));
      throw error;
    }
  }

  const listsToShow = activeList ? [activeList] : overview.lists;
  const itemsOf = (listId: string) => actions.items.filter((item) => item.listId === listId);

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
      <Button asChild>
        <Link to="/shopping/shops">
          <StoreIcon />
          {t("actions.shopView")}
        </Link>
      </Button>
    </>
  );

  const chip = (id: string | null, label: string, count: number) => (
    <button
      key={id ?? "all"}
      type="button"
      aria-pressed={activeListId === id || (!activeList && id === null)}
      onClick={() => selectList(id)}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        (id === null ? !activeList : activeList?.id === id)
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:bg-accent",
      )}
    >
      {label}
      <span className="text-xs tabular-nums opacity-80">{count}</span>
    </button>
  );

  return (
    <PageContainer>
      <PageHeader title={t("page.title")} description={t("page.description")} actions={headerActions} />

      <PageGrid columns="main-sidebar" className="items-start">
        <Stack gap="lg">
          {overview.lists.length > 1 && (
            <ScrollRow label={t("lists.filterLabel")} focusable={false}>
              {chip(null, t("lists.all"), totalOpen)}
              {overview.lists.map((list) => chip(list.id, list.name, list.openCount))}
            </ScrollRow>
          )}

          <Card className="gap-3 p-4">
            <AddShoppingItemForm
              key={addRequest ?? "idle"}
              products={products}
              shops={shops}
              onAdd={add}
              previewLink={previewLink}
              initialSelections={initialSelections}
              autoFocus={addRequest !== null}
            />
          </Card>

          {totalOpen > 0 && <ShoppingGuidance />}

          {overview.lists.length === 0 || (totalOpen === 0 && actions.items.length === 0) ? (
            <EmptyState icon={ShoppingCartIcon} title={t("lists.emptyAll")} />
          ) : (
            listsToShow.map((list) => {
              const items = itemsOf(list.id);
              if (!activeList && items.length === 0) return null;
              return (
                <PageSection key={list.id} aria-labelledby={`list-${list.id}`}>
                  <SectionHeader
                    id={`list-${list.id}`}
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
                            list={list}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={t("actions.editList")} title={t("actions.editList")}>
                                <PencilIcon />
                              </Button>
                            }
                          />
                          <DeleteConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={t("listForm.deleteTitle", { name: list.name })}>
                                <Trash2Icon />
                              </Button>
                            }
                            title={t("listForm.deleteTitle", { name: list.name })}
                            description={t("listForm.deleteDescription")}
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
                    items={items}
                    shops={shops}
                    onToggle={(item) => void actions.toggle(item)}
                    onDelete={canManage ? (item) => void actions.remove(item) : undefined}
                    onEdit={canManage ? setEditing : undefined}
                    emptyText={t("lists.empty")}
                  />
                </PageSection>
              );
            })
          )}
        </Stack>

        <Stack gap="lg">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-1">
                <CardTitle>{t("shops.title")}</CardTitle>
                <CardDescription>{t("shops.description")}</CardDescription>
              </div>
            </CardHeader>
            {totalOpen > 0 ? (
              <ShopSummaryList items={actions.items} shops={shops} className="-mx-2" />
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
