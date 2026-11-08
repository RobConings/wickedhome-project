import * as React from "react";
import { useSearchParams } from "react-router";
import { SHOP_VIEW_SORTS, type ShopViewSort } from "../components/shopping-grouping";

/** URL wins; the last chosen order is shared by list, shop view and trips on this device. */
export function useShoppingSort(advanced = false) {
  const [params, setParams] = useSearchParams();
  const [stored, setStored] = React.useState(() => {
    try { return localStorage.getItem("wh-shopping-sort") ?? localStorage.getItem("wh-shop-view-sort"); } catch { return null; }
  });
  const requested = params.get("sort") ?? stored;
  const sort: ShopViewSort = SHOP_VIEW_SORTS.includes(requested as ShopViewSort) && (advanced || requested === "category" || requested === "name") ? requested as ShopViewSort : "category";
  const changeSort = (next: ShopViewSort) => {
    setStored(next);
    try { localStorage.setItem("wh-shopping-sort", next); } catch { /* The URL still retains the choice. */ }
    setParams((current) => { current.set("sort", next); return current; }, { preventScrollReset: true });
  };
  return { sort, changeSort };
}
