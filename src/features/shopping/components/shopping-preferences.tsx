import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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

export function AutomaticShoppingFilter({ included, onChange }: { included: boolean; onChange: (value: boolean) => void }) {
  const { t } = useTranslation("shopping");
  return <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={included} onChange={(event) => onChange(event.target.checked)} />{t("planning.includeAutomatic")}</label>;
}

export function CategoryOrder({ order, onChange }: { order: ProductCategory[]; onChange: (value: ProductCategory[]) => void }) {
  const { t } = useTranslation("shopping");
  const move = (index: number, delta: number) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    onChange(next);
  };
  return <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer">{t("planning.categoryOrder")}</summary><ol className="mt-3 space-y-1">{order.map((category, index) => <li className="flex items-center justify-between gap-2" key={category}><span>{t(`categories.${category}`)}</span><span><Button type="button" size="sm" variant="ghost" disabled={index === 0} aria-label={t("planning.moveUp", { name: t(`categories.${category}`) })} onClick={() => move(index, -1)}>↑</Button><Button type="button" size="sm" variant="ghost" disabled={index === order.length - 1} aria-label={t("planning.moveDown", { name: t(`categories.${category}`) })} onClick={() => move(index, 1)}>↓</Button></span></li>)}</ol></details>;
}
