import { ArrowDownUpIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SearchField } from "@/components/shared/search-field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductCategory } from "../types/shopping";
import {
  NO_SHOP_VIEW_FILTERS,
  SHOP_VIEW_PRIORITY_FILTERS,
  SHOP_VIEW_SORTS,
  isShopViewFiltered,
  type ShopViewFilters,
  type ShopViewPriorityFilter,
  type ShopViewSort,
} from "./shopping-grouping";

type ShopViewToolbarProps = {
  sort: ShopViewSort;
  onSortChange: (sort: ShopViewSort) => void;
  filters: ShopViewFilters;
  onFiltersChange: (filters: ShopViewFilters) => void;
  /** Categories of the items here, in walking order. */
  categories: ProductCategory[];
  /** Lists the items here are on. */
  lists: { id: string; name: string }[];
};

/** Search, sort and filters of the shop view. On phones every control takes the full width. */
export function ShopViewToolbar({ sort, onSortChange, filters, onFiltersChange, categories, lists }: ShopViewToolbarProps) {
  const { t } = useTranslation("shopping");
  const set = (patch: Partial<ShopViewFilters>) => onFiltersChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t("shopView.filters.label")}>
      <SearchField value={filters.query} onValueChange={(query) => set({ query })} placeholder={t("shopView.filters.search")} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={sort} onValueChange={(value) => onSortChange(value as ShopViewSort)}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t("shopView.sort.label")}>
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
        <Select value={filters.priority} onValueChange={(value) => set({ priority: value as ShopViewPriorityFilter })}>
          <SelectTrigger className="w-full sm:w-48" aria-label={t("shopView.filters.priority")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHOP_VIEW_PRIORITY_FILTERS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`shopView.filters.priorities.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categories.length > 1 && (
          <Select value={filters.category} onValueChange={(category) => set({ category })}>
            <SelectTrigger className="w-full sm:w-48" aria-label={t("fields.category")}>
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
            <SelectTrigger className="w-full sm:w-48" aria-label={t("fields.list")}>
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
      </div>
    </div>
  );
}
