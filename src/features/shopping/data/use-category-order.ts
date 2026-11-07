import * as React from "react";
import { PRODUCT_CATEGORIES, type ProductCategory } from "../types/shopping";

const KEY = "wh-shopping-category-order";
export function useCategoryOrder() {
  const [order, setOrder] = React.useState<ProductCategory[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
      return Array.isArray(stored) ? [...new Set([...stored.filter((item): item is ProductCategory => PRODUCT_CATEGORIES.includes(item)), ...PRODUCT_CATEGORIES])] : [...PRODUCT_CATEGORIES];
    } catch { return [...PRODUCT_CATEGORIES]; }
  });
  const change = (next: ProductCategory[]) => {
    setOrder(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event(KEY));
  };
  React.useEffect(() => {
    const reload = () => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (Array.isArray(stored)) setOrder([...new Set([...stored.filter((item): item is ProductCategory => PRODUCT_CATEGORIES.includes(item)), ...PRODUCT_CATEGORIES])]);
      } catch { /* Keep the current order. */ }
    };
    window.addEventListener(KEY, reload);
    window.addEventListener("storage", reload);
    return () => { window.removeEventListener(KEY, reload); window.removeEventListener("storage", reload); };
  }, []);
  return { order, change };
}
