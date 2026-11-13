import { PageGrid } from "@/components/layout/page-grid";
import { Stack } from "@/components/layout/stack";
import { Inline } from "@/components/layout/inline";
import { ArrowDownUpIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchField } from "@/components/shared/search-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductCategory } from "../types/shopping";
import {
  NO_SHOP_VIEW_FILTERS,
  SHOP_VIEW_SORTS,
  isShopViewFiltered,
  type ShopViewFilters,
  type ShopViewSort,
} from "./shopping-grouping";
import { ShoppingStockFilterField } from "./shopping-stock-filter";
import { AutomaticShoppingFilter } from "./shopping-preferences";
import { ShoppingGuidance } from "./shopping-guidance";

type ShopViewToolbarProps = {
  sort: ShopViewSort;
  onSortChange: (sort: ShopViewSort) => void;
  filters: ShopViewFilters;
  onFiltersChange: (filters: ShopViewFilters) => void;
  /** Categories of the items here, in walking order. */
  categories: ProductCategory[];
  /** Lists the items here are on. */
  lists: { id: string; name: string }[];
  includeLowStock: boolean;
  onIncludeLowStockChange: (included: boolean) => void;
};

/** Search stays visible; mobile sort and filters open on demand instead of pushing the list down. */
export function ShopViewToolbar({ sort, onSortChange, filters, onFiltersChange, categories, lists, includeLowStock, onIncludeLowStockChange }: ShopViewToolbarProps) {
  const { t } = useTranslation("shopping");
  const set = (patch: Partial<ShopViewFilters>) => onFiltersChange({ ...filters, ...patch });

  const { t: common } = useTranslation();
  const filterCount = [filters.category !== "all", filters.listId !== "all", filters.priority !== "all", (filters.stock ?? "all") !== "all", !includeLowStock].filter(Boolean).length;
  const controls = (
    <PageGrid gap="3" className="min-w-0 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
        <Select value={sort} onValueChange={(value) => onSortChange(value as ShopViewSort)}>
          <SelectTrigger className="w-full min-w-0 sm:w-48" aria-label={t("shopView.sort.label")}>
            <ArrowDownUpIcon aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHOP_VIEW_SORTS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`shopView.sort.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categories.length > 1 && (
          <Select value={filters.category} onValueChange={(category) => set({ category })}>
            <SelectTrigger className="w-full min-w-0 sm:w-48" aria-label={t("fields.category")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("shopView.filters.allCategories")}</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {t(`categories.${category}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {lists.length > 1 && (
          <Select value={filters.listId} onValueChange={(listId) => set({ listId })}>
            <SelectTrigger className="w-full min-w-0 sm:w-48" aria-label={t("fields.list")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("lists.all")}</SelectItem>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isShopViewFiltered(filters) && (
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onFiltersChange(NO_SHOP_VIEW_FILTERS)}>
            <XIcon />
            {t("shopView.filters.clear")}
          </Button>
        )}
    </PageGrid>
  );

  return (
    <Stack gap="sm" className="min-w-0" role="group" aria-label={t("shopView.filters.label")}>
      <ShoppingStockFilterField value={filters.stock ?? "all"} onChange={(stock) => set({ stock })} />
      <Inline gap="sm" align="center" className="min-w-0">
        <SearchField className="min-w-0 flex-1" value={filters.query} onValueChange={(query) => set({ query })} placeholder={t("shopView.filters.search")} />
        <Dialog>
          <DialogTrigger asChild><Button variant="outline" className="h-10 shrink-0" aria-label={t("shopView.filters.viewOptions")}><SlidersHorizontalIcon /><span className="hidden sm:inline">{t("shopView.filters.viewOptions")}</span>{filterCount > 0 && <span className="text-xs">{filterCount}</span>}</Button></DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("shopView.filters.viewOptions")}</DialogTitle><DialogDescription>{t("shopView.filters.viewOptionsDescription")}</DialogDescription></DialogHeader>
            {controls}
            <AutomaticShoppingFilter included={includeLowStock} onChange={onIncludeLowStockChange} />
            <ShoppingGuidance />
            <DialogFooter><DialogClose asChild><Button>{common("actions.close")}</Button></DialogClose></DialogFooter>
          </DialogContent>
        </Dialog>
      </Inline>
      <div className="hidden sm:block">{controls}</div>
    </Stack>
  );
}
